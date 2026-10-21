import logger from "./utils/logger";

export type LoanStatus = "pending" | "active" | "repaid" | "liquidated" | "at_risk";

export type TransitionTrigger = "job" | "api" | "liquidation";

export interface TransitionRecord {
  from: LoanStatus;
  to: LoanStatus;
  at: string; // ISO timestamp
  triggeredBy?: TransitionTrigger;
}

/**
 * Minimal database connection surface required to persist transitions.
 * Compatible with `pg` Pool/PoolClient and similar drivers.
 */
export interface TransitionDb {
  query(
    text: string,
    values?: unknown[]
  ): Promise<{ rows: unknown[] }>;
}

export interface TransitionOptions {
  /** Database connection used to persist the transition audit row. */
  db?: TransitionDb;
  /** Identifier of the loan whose status is changing. */
  loanId?: string;
  /** What initiated the transition (job/api/liquidation). */
  triggeredBy?: TransitionTrigger;
}

export interface TransitionLogContext {
  loanId?: string;
  triggeredBy?: string;
}

const SAFE_TRIGGER_SOURCES = new Set(["system", "scheduler", "admin", "user", "api", "liquidation"]);

function safeTriggeredBy(triggeredBy?: string): string {
  if (triggeredBy && SAFE_TRIGGER_SOURCES.has(triggeredBy)) return triggeredBy;
  return "system";
}

/** Log a state transition without emitting wallet addresses or other actor PII. */
export function logLoanStateTransition(fields: {
  loanId: string;
  fromState: string;
  toState: string;
  triggeredBy?: string;
  timestamp: string;
}): void {
  logger.info("loan_state_transition", {
    loanId: fields.loanId,
    fromState: fields.fromState,
    toState: fields.toState,
    triggeredBy: safeTriggeredBy(fields.triggeredBy),
    timestamp: fields.timestamp,
  });
}

export class InvalidTransitionError extends Error {
  constructor(from: LoanStatus, to: LoanStatus) {
    super(`Invalid loan transition: ${from} → ${to}`);
    this.name = "InvalidTransitionError";
  }
}

// Valid transitions: from → allowed next states
const TRANSITIONS: Record<LoanStatus, LoanStatus[]> = {
  pending: ["active"],
  active: ["repaid", "liquidated", "at_risk"],
  at_risk: ["repaid", "liquidated", "active"],
  repaid: [],
  liquidated: [],
};

/**
 * Validate and apply a loan status transition.
 * Throws InvalidTransitionError for disallowed transitions.
 * Returns the new status and appends to the history array.
 * When a DB connection and loan id are supplied, a row is inserted into
 * `loan_transitions` to persist the audit trail.
 * @param current - The current loan status.
 * @param next - The desired next loan status.
 * @param history - Mutable array to append the transition record to.
 * @param options - Optional persistence options (db, loanId, triggeredBy).
 * @returns The new {@link LoanStatus} after the transition.
 * @throws {@link InvalidTransitionError} if the transition from `current` to `next` is not allowed.
 * @example
 * const history: TransitionRecord[] = [];
 * const newStatus = await transition("pending", "active", history, {
 *   db,
 *   loanId: "loan-1",
 *   triggeredBy: "api",
 * });
 */
export async function transition(
  current: LoanStatus,
  next: LoanStatus,
  history: TransitionRecord[],
  context: TransitionLogContext = {}
): LoanStatus {
  if (!TRANSITIONS[current].includes(next)) {
    throw new InvalidTransitionError(current, next);
  }
  const timestamp = new Date().toISOString();
  history.push({ from: current, to: next, at: timestamp });
  logLoanStateTransition({
    loanId: context.loanId ?? "unknown",
    fromState: current,
    toState: next,
    triggeredBy: context.triggeredBy,
    timestamp,
  });
  return next;
}

/**
 * Returns the valid next states from a given status.
 * @param status - The current loan status.
 * @returns Array of {@link LoanStatus} values that are valid next states.
 * @example
 * allowedTransitions("active"); // ["repaid", "liquidated"]
 */
export function allowedTransitions(status: LoanStatus): LoanStatus[] {
  return TRANSITIONS[status];
}
