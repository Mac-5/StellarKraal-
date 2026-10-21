import cron, { ScheduledTask } from "node-cron";
import { listActiveLoans, updateLoan } from "../db/store";
import logger from "../utils/logger";
import { fireAlert } from "../utils/alerting";
import { config } from "../config";
import {
  computeHealthFactor,
  healthFactorService,
  LIQUIDATION_THRESHOLD_BPS,
  SCALE,
} from "../services/healthFactorService";

import {
  Contract,
  TransactionBuilder,
  BASE_FEE,
  Networks,
  nativeToScVal,
  scValToNative,
} from "@stellar/stellar-sdk";
import { rpcClient } from "../utils/rpcClient";

const NETWORK_PASSPHRASE =
  config.NEXT_PUBLIC_NETWORK === "mainnet" ? Networks.PUBLIC : Networks.TESTNET;
const CONTRACT_ID = config.CONTRACT_ID;
const SIMULATION_ACCOUNT = "GASPH4OCYOERATXIKLPNURXUP7ISAQU2KWFB5XLUJ3LQHKHOCN3CEGD6";

/** One hour in milliseconds — cooldown between repeated alerts for the same loan. */
const ALERT_COOLDOWN_MS = 60 * 60 * 1000;

/**
 * Threshold (×SCALE) below which a warning alert fires.
 * Reads HEALTH_FACTOR_WARN from config (default 13000 → 1.3).
 */
const WARN_THRESHOLD = parseInt(config.HEALTH_FACTOR_WARN, 10);

/**
 * Threshold (×SCALE) below which a critical alert fires.
 * Reads HEALTH_FACTOR_CRIT from config (default 10000 → 1.0).
 */
const CRIT_THRESHOLD = parseInt(config.HEALTH_FACTOR_CRIT, 10);

// Per-loan cooldown map keyed by `${loanId}:${level}`.
const alertCooldowns = new Map<string, number>();

/**
 * Returns true if a cooldown entry for this key is still active.
 * @param key - `${loanId}:warning` or `${loanId}:critical`
 */
function isOnCooldown(key: string): boolean {
  const last = alertCooldowns.get(key);
  return last !== undefined && Date.now() - last < ALERT_COOLDOWN_MS;
}

/**
 * Fire a per-loan health factor alert if not within the cooldown window.
 * @param loanId - ID of the loan that triggered the alert.
 * @param level - Alert severity: "warning" or "critical".
 * @param hf - Current health factor value (×SCALE).
 */
async function maybeAlert(loanId: string, level: "warning" | "critical", hf: number): Promise<void> {
  const key = `${loanId}:${level}`;
  if (isOnCooldown(key)) return;
  alertCooldowns.set(key, Date.now());

  const rule = {
    id: `health_factor_${level}_${loanId}`,
    name: `Health Factor ${level.charAt(0).toUpperCase() + level.slice(1)}`,
    severity: level as "warning" | "critical",
    cooldownMs: ALERT_COOLDOWN_MS,
    runbook: "liquidation-failure.md",
    pagerduty: level === "critical",
  };

  await fireAlert(rule, `Loan ${loanId} health factor ${hf} dropped below ${level} threshold`, {
    loanId,
    healthFactor: hf,
    warnThreshold: WARN_THRESHOLD,
    critThreshold: CRIT_THRESHOLD,
  });
}

/**
 * Simulate the on-chain `health_factor` contract view call for a loan.
 * @param loanId - Loan identifier (number or string representation).
 * @returns The simulated health factor (scaled by 10,000), or null if the RPC call fails or returns empty.
 */
export async function simulateHealthFactor(loanId: string): Promise<number | null> {
  try {
    let numericId: bigint;
    try {
      numericId = BigInt(loanId);
    } catch {
      const digits = loanId.replace(/\D/g, "");
      numericId = digits.length > 0 ? BigInt(digits) : BigInt(1);
    }

    const contract = new Contract(CONTRACT_ID);
    const account = (await rpcClient.getAccount(SIMULATION_ACCOUNT)) as any;
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        contract.call("health_factor", nativeToScVal(numericId, { type: "u64" }))
      )
      .setTimeout(30)
      .build();

    const sim = await rpcClient.simulateTransaction(tx);
    const retval = (sim as any)?.result?.retval;
    if (retval === undefined || retval === null) {
      return null;
    }
    const nativeVal = scValToNative(retval);
    const hfNum = Number(nativeVal);
    return Number.isFinite(hfNum) ? hfNum : null;
  } catch (error) {
    logger.warn("healthFactorJob: simulateHealthFactor failed", {
      loanId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Recalculate health factors for all active/at_risk loans by querying the on-chain contract,
 * falling back to the HealthFactorService when the simulation is unavailable,
 * flag those below CRIT threshold, and fire configurable warning/critical alerts with per-loan cooldown.
 * @returns The number of loan records updated.
 */
export interface HealthFactorEvaluation {
  updated: number;
  candidates: Array<LoanRecord & { health_factor: number }>;
}

/**
 * Evaluate all active loans using the same on-chain health-factor lookup as the
 * scheduled job. Updates are optional so administrative dry-runs are read-only.
 */
export async function evaluateHealthFactors(options: {
  applyUpdates?: boolean;
} = {}): Promise<HealthFactorEvaluation> {
  const start = Date.now();
  logger.info("healthFactorJob: starting");

  const loans = listActiveLoans();
  let updated = 0;
  const candidates: Array<LoanRecord & { health_factor: number }> = [];

  for (const loan of loans) {
    let hf: number | null = null;
    try {
      hf = await simulateHealthFactor(loan.id);
    } catch (err) {
      logger.warn("healthFactorJob: failed to fetch health factor for loan", {
        loanId: loan.id,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    if (hf === null) {
      // Fall back to the centralized service when the on-chain simulation is unavailable.
      hf = healthFactorService.calculateHealthFactor(loan.id);
    }

    if (hf === null) {
      // Gracefully skip loan if neither simulation nor local calculation yields a value
      continue;
    }

    const newStatus = hf < SCALE ? "at_risk" : "active";

    if (hf < SCALE) {
      candidates.push({ ...loan, health_factor: hf, status: newStatus });
    }

    if (options.applyUpdates !== false && (loan.health_factor !== hf || loan.status !== newStatus)) {
      updateLoan(loan.id, { health_factor: hf, status: newStatus });
      updated++;
    }

    // Fire alerts based on configurable thresholds
    if (hf < CRIT_THRESHOLD) {
      await maybeAlert(loan.id, "critical", hf);
    } else if (hf < WARN_THRESHOLD) {
      await maybeAlert(loan.id, "warning", hf);
    }
  }

  const duration = Date.now() - start;
  logger.info("healthFactorJob: completed", { duration_ms: duration, updated });
  return { updated, candidates };
}

export async function runHealthFactorJob(): Promise<number> {
  const result = await evaluateHealthFactors();
  return result.updated;
}

/**
 * Schedule the health factor job to run every hour.
 * Returns the scheduled task so the caller can stop it on shutdown.
 * @returns The scheduled cron task instance.
 */
export function scheduleHealthFactorJob(): ScheduledTask {
  return cron.schedule("0 * * * *", async () => {
    try {
      await runHealthFactorJob();
    } catch (err) {
      logger.error("healthFactorJob: unhandled error", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}

/** Exported for testing only — clears the per-loan alert cooldown map. */
export function _resetAlertCooldowns(): void {
  alertCooldowns.clear();
}

// Re-export the centralized formula so existing importers keep working.
export { computeHealthFactor, LIQUIDATION_THRESHOLD_BPS };
