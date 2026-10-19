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
  options: TransitionOptions = {}
): Promise<LoanStatus> {
  if (!TRANSITIONS[current].includes(next)) {
    throw new InvalidTransitionError(current, next);
  }

  const at = new Date().toISOString();
  const triggeredBy = options.triggeredBy ?? "api";

  if (options.db && options.loanId) {
    await options.db.query(
      `INSERT INTO loan_transitions
         (loan_id, from_status, to_status, transitioned_at, triggered_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [options.loanId, current, next, at, triggeredBy]
    );
  }

  history.push({ from: current, to: next, at, triggeredBy });
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
