/**
 * Contract event listener for StellarKraal Soroban contract.
 * Polls the RPC for contract events and updates the local database.
 *
 * Full event schemas (topics, data fields, types, JSON examples) are documented in:
 *   docs/protocol/events.md
 *
 * Events handled:
 * - livestock/registered  → upsert collateral record
 * - loan/requested        → upsert loan record
 * - loan/repaid           → update loan outstanding balance
 * - loan_liquidated       → update loan status to liquidated, record liquidation event
 *                           Topics: [loan_liquidated, borrower, liquidator]
 *                           Data:   (loan_id, repay_amount, collateral_seized)
 * - livestock/registered  → upsert collateral record          (events.md §1)
 * - loan/requested        → upsert loan record                (events.md §2)
 * - loan_repaid           → update loan outstanding balance   (events.md §3)
 * - loan/liquidated       → update loan status + insert event (events.md §4)
 *
 * Unhandled events (Admin/*, fee/cfgUpd, whitelist/*, upgrade/*, TWAP/price,
 * Pause, Unpause, StaleThr) are logged at debug level but not persisted.
 * See docs/protocol/events.md §5–§23 for their full schemas.
 */

import { rpc as SorobanRpc, xdr, Address, StrKey } from "@stellar/stellar-sdk";
import { z } from "zod";
import logger from "./utils/logger";
import { rpcClient } from "./utils/rpcClient";
import { insertCollateral, insertLoan, updateTransaction, updateLoan, insertLiquidationEvent, getLedgerCursor, setLedgerCursor } from "./db/store";

const getContractId = () => process.env.CONTRACT_ID || "";
const POLL_INTERVAL_MS = parseInt(process.env.EVENT_POLL_INTERVAL_MS || "5000", 10);

let lastLedger = 0;
let pollTimer: ReturnType<typeof setTimeout> | null = null;

type LogLevel = "debug" | "info" | "warn" | "error";

const eventLogSchema = z.object({
  timestamp: z.string().datetime(),
  eventType: z.string().min(1),
  contractId: z.string().min(1),
  ledger: z.number().int().nonnegative(),
  correlationId: z.string().min(1),
  context: z.record(z.string(), z.unknown()).optional(),
  error: z
    .object({
      message: z.string().min(1),
      stack: z.string().optional(),
    })
    .optional(),
});

export type EventLogEntry = z.infer<typeof eventLogSchema>;

function getConfiguredLogLevel(): LogLevel {
  const raw = (process.env.EVENT_LISTENER_LOG_LEVEL ?? "info").toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return raw;
  }
  return "info";
}

/**
 * Normalize a ledger input into a non-negative integer.
 * @param ledger - Ledger sequence value from an event.
 * @returns A safe integer ledger value.
 */
function safeLedger(ledger: unknown): number {
  return typeof ledger === "number" && Number.isInteger(ledger) && ledger >= 0 ? ledger : 0;
}

/**
 * Derive a correlation ID from a Soroban event.
 * @param event - Raw Soroban event.
 * @returns Existing event ID if available, otherwise a ledger-based fallback.
 */
function deriveCorrelationId(event: SorobanRpc.Api.RawEventResponse): string {
  const maybeId = (event as unknown as { id?: string }).id;
  if (typeof maybeId === "string" && maybeId.length > 0) {
    return maybeId;
  }
  return `ledger-${safeLedger(event.ledger)}`;
}

/**
 * Build a structured listener log entry constrained by runtime schema validation.
 * @param eventType - Listener event category identifier.
 * @param event - Raw Soroban event.
 * @param context - Additional structured metadata.
 * @param error - Optional error object.
 * @returns A schema-validated structured log entry.
 */
export function createEventLogEntry(
  eventType: string,
  event: SorobanRpc.Api.RawEventResponse,
  context?: Record<string, unknown>,
  error?: Error,
): EventLogEntry {
  return eventLogSchema.parse({
    timestamp: new Date().toISOString(),
    eventType,
    contractId: getContractId() || "unknown-contract",
    ledger: safeLedger(event.ledger),
    correlationId: deriveCorrelationId(event),
    context,
    error: error
      ? {
          message: error.message,
          stack: error.stack,
        }
      : undefined,
  });
}

/**
 * Emit a schema-validated structured event log at the configured level.
 * @param eventType - Listener event category identifier.
 * @param event - Raw Soroban event.
 * @param context - Additional structured metadata.
 * @param error - Optional error captured during processing.
 */
function logEvent(
  eventType: string,
  event: SorobanRpc.Api.RawEventResponse,
  context?: Record<string, unknown>,
  error?: Error,
): void {
  const entry = createEventLogEntry(eventType, event, context, error);
  const method = getConfiguredLogLevel();
  logger[method]("contract_event_listener", entry);
}

/**
 * Decode a Soroban account address ScVal into a base32 Stellar G-address.
 * @param val - ScVal expected to wrap an account address.
 * @returns The StrKey-encoded G-address, or an empty string if decoding fails.
 */
export function decodeAccountAddress(val: any): string {
  try {
    const ed25519 = val?.address?.()?.accountId?.()?.ed25519?.();
    if (!ed25519) return "";
    return StrKey.encodeEd25519PublicKey(Buffer.from(ed25519));
  } catch {
    return "";
  }
}

/**
 * Parse a contract event and update the local store accordingly.
 * @param event - Raw Soroban contract event from the RPC
 */
function handleEvent(event: SorobanRpc.Api.RawEventResponse): void {
  try {
    if (event.type !== "contract") return;

    const rawTopics = event.topic ?? [];
    // Cast to any to call the XDR accessor methods (.sym, .vec, etc.) which are
    // not exposed on the base ScVal union type in the current SDK typings.
    const topics = rawTopics.map((t) => xdr.ScVal.fromXDR(t, "base64") as any);
    if (topics.length < 2) return;

    const ns = topics[0].sym?.().toString();
    if (!ns) return;

    const action = topics[1]?.sym?.().toString();
    const key = action ? `${ns}/${action}` : ns;

    logEvent("contract.event.received", event, { key });

    if (key === "collateral_registered") {
      // topics: [symbol("collateral_registered"), owner]
      // data: (id, animal_type, count, appraised_value)
      const owner = (() => { try { return Address.fromScVal(topics[1]).toString(); } catch { return ""; } })();
      const vals = ((xdr.ScVal.fromXDR(event.value, "base64") as any).vec?.() ?? []) as any[];
      if (vals.length < 4) return;
      const id = vals[0].u64?.().toString() ?? "";
      const animal_type = vals[1].sym?.().toString() ?? "";
      const count = Number(vals[2].u32?.() ?? 0);
      const appraised_value = Number(vals[3].i128?.().lo ?? 0);
      insertCollateral({ id, owner, animal_type, count, appraised_value });
      logEvent("contract.event.collateral_synced", event, {
        id,
        owner,
        animal_type,
      });
    } else if (key === "loan/requested") {
      // data: (loan_id, borrower, amount, disbursement, total_collateral_value)
      const vals = ((xdr.ScVal.fromXDR(event.value, "base64") as any).vec?.() ?? []) as any[];
      if (vals.length < 3) return;
      const id = vals[0].u64?.().toString() ?? "";
      const borrower = decodeAccountAddress(vals[1]);
      const amount = Number(vals[2].i128?.().lo ?? 0);
      insertLoan({ id, borrower, collateral_id: "", amount });
      logEvent("contract.event.loan_synced", event, {
        id,
        borrower,
        amount,
      });
    } else if (key === "loan_repaid") {
      // data: (loan_id, principal_paid, interest_paid, remaining_balance)
      const vals = ((xdr.ScVal.fromXDR(event.value, "base64") as any).vec?.() ?? []) as any[];
      if (vals.length < 4) return;
      const id = vals[0].u64?.().toString() ?? "";
      const principalPaid = Number(vals[1].i128?.().lo ?? 0);
      const interestPaid = Number(vals[2].i128?.().lo ?? 0);
      const repayAmount = principalPaid + interestPaid;
      updateTransaction(id, { status: "completed", amount: repayAmount });
      logEvent("contract.event.loan_repaid_synced", event, { id, repayAmount, principalPaid, interestPaid });
    } else if (key === "loan/liquidated") {
      // data: (loan_id, liquidator, repay_amount, outstanding, status)
      const vals = ((xdr.ScVal.fromXDR(event.value, "base64") as any).vec?.() ?? []) as any[];
      if (vals.length < 3) return;
      const id = vals[0].u64?.().toString() ?? "";
      const liquidator = (() => { 

/* … truncated 2376 chars — edit only what you need near the top … */
