/**
 * Lightweight in-memory store with soft delete support.
 * Provides audit trail for loans and collateral records.
 * Migration system is managed by db-migrate for schema versioning.
 *
 * Note: This is an in-memory implementation for development.
 * In production, replace with actual database queries.
 */
import { logLoanStateTransition } from '../loanStateMachine';

export interface AppraisalEntry {
  date: string;
  value: number;
  appraiser?: string;
  appraiserNote?: string;
}
export type CollateralStatus = 'available' | 'pledged' | 'liquidated';

export interface CollateralRecord {
  id: string;
  owner: string;
  animal_type: string;
  breed?: string;
  age_years?: number;
  weight_kg?: number;
  photo_url?: string;
  count: number;
  appraised_value: number;
  appraisal_history: AppraisalEntry[];
  status?: CollateralStatus;
  createdAt: string;
  deletedAt: string | null;
}

export type LoanStatus = 'active' | 'at_risk' | 'repaid' | 'liquidated';

export interface LoanRecord {
  id: string;
  borrower: string;
  collateral_id: string;
  amount: number;
  status?: LoanStatus;
  health_factor?: number | null;
  createdAt: string;
  deletedAt: string | null;
}

export interface LoanSummary {
  totalLoans: number;
  activeLoans: number;
  atRiskLoans: number;
  repaidLoans: number;
  liquidatedLoans: number;
  totalLoanValueXLM: number;
}

export type TransactionType = 'loan' | 'repayment' | 'liquidation';
export type TransactionStatus = 'pending' | 'completed' | 'failed';

export interface TransactionRecord {
  id: string;
  borrower: string;
  type: TransactionType;
  status: TransactionStatus;
  amount: number;
  loanId?: string;
  collateralId?: string;
  /** Stellar transaction hash — used to link to the Stellar Expert explorer. */
  tx_hash?: string;
  createdAt: string;
  updatedAt: string;
}

// In-memory tables (replace with a real DB in production)
const collateralTable: Map<string, CollateralRecord> = new Map();
const loanTable: Map<string, LoanRecord> = new Map();
const transactionTable: Map<string, TransactionRecord> = new Map();

// ── Collateral ────────────────────────────────────────────────────────────────

/**
 * Insert a new collateral record into the in-memory store.
 * @param data - Collateral fields excluding auto-generated timestamps.
 * @returns The created {@link CollateralRecord} with `createdAt` and `deletedAt` set.
 * @example
 * const record = insertCollateral({ id: "1", owner: "G...", animal_type: "cattle", count: 5, appraised_value: 1000000 });
 */
export function insertCollateral(
  data: Omit<CollateralRecord, 'createdAt' | 'deletedAt' | 'appraisal_history'> & {
    status?: CollateralStatus;
  }
): CollateralRecord {
  const record: CollateralRecord = {
    status: 'available',
    ...data,
    appraisal_history: [{ date: new Date().toISOString(), value: data.appraised_value }],
    createdAt: new Date().toISOString(),
    deletedAt: null,
  };
  collateralTable.set(record.id, record);
  return record;
}

/**
 * Add a new appraisal entry for an existing collateral record.
 * @param id - Collateral record ID.
 * @param value - New appraised value.
 * @param appraiser - Optional appraiser wallet address.
 * @param appraiserNote - Optional note recorded with this appraisal.
 * @returns `true` if updated, `false` if not found or soft-deleted.
 */
export function addAppraisal(id: string, value: number, appraiser?: string, appraiserNote?: string): boolean {
  const r = collateralTable.get(id);
  if (!r || r.deletedAt !== null) return false;
  r.appraised_value = value;
  r.appraisal_history.push({
    date: new Date().toISOString(),
    value,
    ...(appraiser ? { appraiser } : {}),
    ...(appraiserNote !== undefined ? { appraiserNote } : {}),
  });
  return true;
}

/**
 * Return paginated appraisal history for a collateral record, ordered by date descending.
 * @param id - Collateral record ID.
 * @param page - Page number (1-indexed, default 1).
 * @param limit - Records per page (default 20, max 100).
 * @returns Paginated result or `null` if not found or soft-deleted.
 */
export function getAppraisalHistory(
  id: string,
  page = 1,
  limit = 20
): { data: AppraisalEntry[]; total: number; page: number; limit: number } | null {
  const r = collateralTable.get(id);
  if (!r || r.deletedAt !== null) return null;
  const sorted = [...r.appraisal_history].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  const cappedLimit = Math.min(limit, 100);
  const safePage = Math.max(page, 1);
  const total = sorted.length;
  const data = sorted.slice((safePage - 1) * cappedLimit, safePage * cappedLimit);
  return { data, total, page: safePage, limit: cappedLimit };
}

export interface AppraisalHistoryItem {
  appraisedAt: string;
  valueUSD: number;
  appraiserNote: string | null;
}

/** Decode a scoped cursor. The append-only history index breaks timestamp ties. */
export function decodeAppraisalCursor(cursor: string): { collateralId: string; date: string; index: number } | null {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(cursor)) return null;
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (
      typeof value.collateralId !== 'string' || !value.collateralId ||
      typeof value.date !== 'string' || isNaN(new Date(value.date).getTime()) ||
      !Number.isSafeInteger(value.index) || value.index < 0
    ) return null;
    return { collateralId: value.collateralId, date: value.date, index: value.index };
  } catch {
    return null;
  }
}

/** Return keyset-paginated history using (date DESC, append-only index DESC). */
export function getAppraisalHistoryCursor(
  id: string,
  cursor?: string,
  limit = 20
): { data: AppraisalHistoryItem[]; nextCursor: string | null; hasMore: boolean } | null {
  const record = getCollateral(id);
  if (!record) return null;
  const position = cursor ? decodeAppraisalCursor(cursor) : null;
  if (cursor && (!position || position.collateralId !== id)) throw new Error('Invalid cursor');
  const cappedLimit = Math.max(1, Math.min(limit, 50));
  const sorted = record.appraisal_history
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => new Date(b.entry.date).getTime() - new Date(a.entry.date).getTime() || b.index - a.index)
    .filter(({ entry, index }) => !position ||
      new Date(entry.date).getTime() < new Date(position.date).getTime() ||
      (new Date(entry.date).getTime() === new Date(position.date).getTime() && index < position.index));
  const page = sorted.slice(0, cappedLimit + 1);
  const hasMore = page.length > cappedLimit;
  const selected = page.slice(0, cappedLimit);
  const last = selected[selected.length - 1];
  const nextCursor = hasMore && last
    ? Buffer.from(JSON.stringify({ collateralId: id, date: last.entry.date, index: last.index })).toString('base64url')
    : null;
  return {
    data: selected.map(({ entry }) => ({
      appraisedAt: entry.date,
      valueUSD: entry.value,
      appraiserNote: entry.appraiserNote ?? null,
    })),
    nextCursor,
    hasMore,
  };
}

/**
 * Return non-deleted collateral records with optional filtering and pagination.
 * @param filters - Optional filter and pagination options.
 * @param filters.status - Filter by collateral status.
 * @param filters.ownerId - Filter by owner address.
 * @param filters.page - Page number (1-indexed, default 1).
 * @param filters.limit - Records per page (default 20, max 100).
 * @returns Paginated result with `data`, `total`, `page`, and `limit`.
 */
export function listCollateral(filters?: {
  status?: CollateralStatus;
  ownerId?: string;
  page?: number;
  limit?: number;
}): { data: CollateralRecord[]; total: number; page: number; limit: number } {
  const limit = Math.min(filters?.limit ?? 20, 100);
  const page = Math.max(filters?.page ?? 1, 1);

  let results = [...collateralTable.values()].filter((r) => r.deletedAt === null);

  if (filters?.status) results = results.filter((r) => r.status === filters.status);
  if (filters?.ownerId) results = results.filter((r) => r.owner === filters.ownerId);

  // Sort by registration date descending
  results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const total = results.length;
  const start = (page - 1) * limit;
  const data = results.slice(start, start + limit);

  return { data, total, page, limit };
}

/**
 * Fetch a single collateral record by ID (excludes soft-deleted records).
 * @param id - Collateral record ID.
 * @returns The {@link CollateralRecord} or `undefined` if not found or deleted.
 */
export function getCollateral(id: string): CollateralRecord | undefined {
  const r = collateralTable.get(id);
  return r && r.deletedAt === null ? r : undefined;
}

/**
 * Fetch a collateral record by ID including soft-deleted rows.
 * @param id - Collateral record ID.
 * @returns The {@link CollateralRecord} or `undefined` if not found.
 */
export function getCollateralIncludingDeleted(id: string): CollateralRecord | undefined {
  return collateralTable.get(id);
}

/**
 * Update fields on an existing collateral record.
 * @param id - Collateral record ID.
 * @param updates - Partial fields to merge.
 * @returns The updated {@link CollateralRecord}, or `undefined` if not found.
 */
export function updateCollateral(
  id: string,
  updates: Partial<Omit<CollateralRecord, 'id' | 'createdAt'>>
): CollateralRecord | undefined {
  const record = collateralTable.get(id);
  if (!record) return undefined;
  const updated = { ...record, ...updates };
  collateralTable.set(id, updated);
  return updated;
}

/**
 * Soft-delete a collateral record by setting its `deletedAt` timestamp.
 * @param id - Collateral record ID.
 * @returns `true` if the record was deleted, `false` if not found or already deleted.
 */
export function softDeleteCollateral(id: string): boolean {
  const r = collateralTable.get(id);
  if (!r || r.deletedAt !== null) return false;
  r.deletedAt = new Date().toISOString();
  return true;
}

/**
 * Restore a soft-deleted collateral record by clearing its `deletedAt` timestamp.
 * @param id - Collateral record ID.
 * @returns `true` if restored, `false` if not found or not currently deleted.
 */
export function restoreCollateral(id: string): boolean {
  const r = collateralTable.get(id);
  if (!r || r.deletedAt === null) return false;
  r.deletedAt = null;
  return true;
}

/**
 * Return all soft-deleted collateral records.
 * @returns Array of deleted {@link CollateralRecord} objects.
 */
export function listDeletedCollateral(): CollateralRecord[] {
  return [...collateralTable.values()].filter((r) => r.deletedAt !== null);
}

// ── Loans ─────────────────────────────────────────────────────────────────────

/**
 * Insert a new loan record into the in-memory store.
 * @param data - Loan fields excluding auto-generated timestamps.
 * @returns The created {@link LoanRecord} with `createdAt` and `deletedAt` set.
 * @example
 * const loan = insertLoan({ id: "1", borrower: "G...", collateral_id: "1", amount: 600000 });
 */
export function insertLoan(
  data: Omit<LoanRecord, 'createdAt' | 'deletedAt'> & { status?: LoanRecord['status'] }
): LoanRecord {
  const record: LoanRecord = {
    ...data,
    status: data.status ?? 'active',
    health_factor: data.health_factor ?? null,
    createdAt: new Date().toISOString(),
    deletedAt: null,
  };
  loanTable.set(record.id, record);
  return record;
}

/**
 * Return all non-deleted loan records with optional filtering and pagination.
 * @param filters - Optional filter and pagination parameters.
 * @param filters.status - Filter by loan status.
 * @param filters.borrowerAddress - Filter by borrower address.
 * @param filters.from - Filter by creation date start (ISO string).
 * @param filters.to - Filter by creation date end (ISO string).
 * @param filters.page - Page number (1-based).
 * @param filters.limit - Maximum records per page (capped at 100).
 * @returns Paginated result with `data`, `total`, `page`, and `limit`.
 */
export function listLoans(filters?: {
  status?: string;
  borrowerAddress?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}): { data: LoanRecord[]; total: number; page: number; limit: number } {
  const limit = Math.min(filters?.limit || 20, 100);
  const page = Math.max(filters?.page || 1, 1);

  let results = [...loanTable.values()].filter((r) => r.deletedAt === null);

  if (filters?.status) results = results.filter((r) => r.status === filters.status);
  if (filters?.borrowerAddress)
    results = results.filter((r) => r.borrower === filters.borrowerAddress);
  if (filters?.from)
    results = results.filter((r) => new Date(r.createdAt) >= new Date(filters.from!));
  if (filters?.to) results = results.filter((r) => new Date(r.createdAt) <= new Date(filters.to!));

  // Sort by creation date descending
  results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const total = results.length;
  const data = results.slice((page - 1) * limit, page * limit);

  return { data, total, page, limit };
}

/**
 * Encode a cursor from a loan record's `createdAt` timestamp and `id`.
 *
 * The cursor is a URL-safe base64 string of the form `<createdAt>|<id>`.
 * Using both fields guarantees stable uniqueness even when multiple loans
 * share the same millisecond timestamp.
 *
 * @param createdAt - ISO 8601 creation timestamp.
 * @param id - Loan record ID.
 * @returns Base64url-encoded cursor string.
 */
export function encodeLoanCursor(createdAt: string, id: string): string {
  return Buffer.from(`${createdAt}|${id}`).toString('base64url');
}

/**
 * Decode a cursor produced by {@link encodeLoanCursor}.
 *
 * @param cursor - Base64url-encoded cursor string.
 * @returns Decoded `{ createdAt, id }` or `null` if the cursor is malformed.
 */
export function decodeLoanCursor(
  cursor: string
): { createdAt: string; id: string } | null {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const pipeIdx = decoded.indexOf('|');
    if (pipeIdx === -1) return null;
    const createdAt = decoded.slice(0, pipeIdx);
    const id = decoded.slice(pipeIdx + 1);
    if (!createdAt || !id || isNaN(new Date(createdAt).getTime())) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

/**
 * Return non-deleted loan records using cursor-based pagination.
 *
 * Records are ordered by `(createdAt DESC, id DESC)` for stable traversal.
 * The cursor encodes the `createdAt` + `id` of the **last record seen**, and
 * the next page begins immediately after that position.
 *
 * @param filters - Filter and pagination parameters.
 * @param filters.cursor - Opaque page token produced by a previous response.
 *   When omitted, returns the first page.
 * @param filters.limit - Maximum records to return (default 20, max 100).
 * @param filters.status - Filter by loan status.
 * @param filters.borrowerAddress - Filter by borrower address.
 * @param filters.from - ISO 8601 lower bound for `createdAt`.
 * @param filters.to   - ISO 8601 upper bound for `createdAt`.
 * @returns `{ data, nextCursor, hasMore }` where `nextCursor` is the opaque
 *   token to pass as `?cursor=` on the next request, or `null` when there
 *   are no more pages.
 */
export function listLoansCursor(filters?: {
  cursor?: string;
  limit?: number;
  status?: string;
  borrowerAddress?: string;
  from?: string;
  to?: string;
}): { data: LoanRecord[]; nextCursor: string | null; hasMore: boolean } {
  const limit = Math.min(filters?.limit ?? 20, 100);

  // Decode cursor position if provided
  let cursorCreatedAt: Date | null = null;
  let cursorId: string | null = null;
  if (filters?.cursor) {
    const decoded = decodeLoanCursor(filters.cursor);
    if (decoded) {
      cursorCreatedAt = new Date(decoded.createdAt);
      cursorId = decoded.id;
    }
  }

  let results = [...loanTable.values()].filter((r) => r.deletedAt === null);

  // Apply filters
  if (filters?.status) results = results.filter((r) => r.status === filters.status);
  if (filters?.borrowerAddress)
    results = results.filter((r) => r.borrower === filters.borrowerAddress);
  if (filters?.from)
    results = results.filter((r) => new Date(r.createdAt) >= new Date(filters.from!));
  if (filters?.to)
    results = results.filter((r) => new Date(r.createdAt) <= new Date(filters.to!));

  // Sort by (createdAt DESC, id DESC) for stable pagination
  results.sort((a, b) => {
    const timeDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (timeDiff !== 0) return timeDiff;
    return b.id.localeCompare(a.id);
  });

  // Apply cursor: skip records that appear at or before the cursor position
  if (cursorCreatedAt !== null && cursorId !== null) {
    const cursorTs = cursorCreatedAt.getTime();
    const cursorIdValue = cursorId;
    const cursorIdx = results.findIndex((r) => {
      const rTs = new Date(r.createdAt).getTime();
      if (rTs !== cursorTs) return rTs < cursorTs;
      return r.id.localeCompare(cursorIdValue) < 0;
    });
    results = cursorIdx === -1 ? [] : results.slice(cursorIdx);
  }

  // Fetch one extra to determine if there's a next page
  const page = results.slice(0, limit + 1);
  const hasMore = page.length > limit;
  const data = page.slice(0, limit);

  const nextCursor =
    hasMore && data.length > 0
      ? encodeLoanCursor(data[data.length - 1].createdAt, data[data.length - 1].id)
      : null;

  return { data, nextCursor, hasMore };
}

/**
 * Return all active (non-deleted, active or at_risk) loan records.
 * @returns Array of active {@link LoanRecord} objects.
 */
export function listActiveLoans(): LoanRecord[] {
  return [...loanTable.values()].filter(
    (r) => r.deletedAt === null && (r.status === 'active' || r.status === 'at_risk')
  );
}

function normalizeHealthFactor(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  // Normalize store values that may be persisted either as ratio (e.g. 1.15)
  // or bps (e.g. 11500).
  return value > 100 ? value / 10_000 : value;
}

/**
 * Aggregate dashboard metrics for loans belonging to a borrower.
 * Returns counts by status and total loan value.
 * @param borrower - Borrower wallet/public key.
 * @returns Aggregated loan summary metrics.
 */
export function getLoanSummaryForBorrower(borrower: string): LoanSummary {
  const allLoans = [...loanTable.values()].filter(
    (r) => r.deletedAt === null && r.borrower === borrower
  );

  const activeLoans = allLoans.filter((r) => r.status === 'active').length;
  const atRiskLoans = allLoans.filter((r) => r.status === 'at_risk').length;
  const repaidLoans = allLoans.filter((r) => r.status === 'repaid').length;
  const liquidatedLoans = allLoans.filter((r) => r.status === 'liquidated').length;
  const totalLoans = allLoans.length;

  const totalLoanValueXLM = allLoans.reduce((sum, loan) => sum + loan.amount, 0);

  return {
    totalLoans,
    activeLoans,
    atRiskLoans,
    repaidLoans,
    liquidatedLoans,
    totalLoanValueXLM,
  };
}

/**
 * Fetch a single loan record by ID (excludes soft-deleted records).
 * @param id - Loan record ID.
 * @returns The {@link LoanRecord} or `undefined` if not found or deleted.
 */
export function getLoan(id: string): LoanRecord | undefined {
  const r = loanTable.get(id);
  return r && r.deletedAt === null ? r : undefined;
}

/**
 * Update fields on an existing loan record.
 * @param id - Loan record ID.
 * @param updates - Partial fields to merge.
 * @returns The updated {@link LoanRecord}, or `undefined` if not found.
 */
export function updateLoan(
  id: string,
  updates: Partial<Omit<LoanRecord, 'id' | 'createdAt'>>,
  triggeredBy = 'system'
): LoanRecord | undefined {
  const record = loanTable.get(id);
  if (!record) return undefined;
  const updated = { ...record, ...updates };
  loanTable.set(id, updated);
  if (record.status && updates.status && record.status !== updates.status) {
    logLoanStateTransition({
      loanId: id,
      fromState: record.status,
      toState: updates.status,
      triggeredBy,
      timestamp: new Date().toISOString(),
    });
  }
  return updated;
}

/**
 * Soft-delete a loan record by setting its `deletedAt` timestamp.
 * @param id - Loan record ID.
 * @returns `true` if deleted, `false` if not found or already deleted.
 */
export function softDeleteLoan(id: string): boolean {
  const r = loanTable.get(id);
  if (!r || r.deletedAt !== null) return false;
  r.deletedAt = new Date().toISOString();
  return true;
}

/**
 * Restore a soft-deleted loan record by clearing its `deletedAt` timestamp.
 * @param id - Loan record ID.
 * @returns `true` if restored, `false` if not found or not currently deleted.
 */
export function restoreLoan(id: string): boolean {
  const r = loanTable.get(id);
  if (!r || r.deletedAt === null) return false;
  r.deletedAt = null;
  return true;
}

/**
 * Return all soft-deleted loan records.
 * @returns Array of deleted {@link LoanRecord} objects.
 */
export function listDeletedLoans(): LoanRecord[] {
  return [...loanTable.values()].filter((r) => r.deletedAt !== null);
}

/**
 * Check if a collateral record is currently pledged to an active loan.
 * @param collateralId - Collateral record ID.
 * @returns `true` if pledged to an active or at-risk, non-deleted loan, `false` otherwise.
 */
export function isCollateralPledged(collateralId: string): boolean {
  return [...loanTable.values()].some(
    (r) =>
      r.collateral_id === collateralId &&
      (r.status === 'active' || r.status === 'at_risk') &&
      r.deletedAt === null
  );
}

// ── Migration helper ──────────────────────────────────────────────────────────

/**
 * Migration 001: Add deletedAt column to loans and collateral tables.
 * For a real DB this would be a SQL migration script.
 */
export function runMigrations(): void {
  // No-op for in-memory store; documents intent for real DB migration
}

// ── Transactions ──────────────────────────────────────────────────────────────

/**
 * Insert a new transaction record with an auto-generated ID and timestamps.
 * @param data - Transaction fields excluding `id`, `createdAt`, and `updatedAt`.
 * @returns The created {@link TransactionRecord}.
 * @example
 * const tx = insertTransaction({ borrower: "G...", type: "loan", status: "pending", amount: 600000 });
 */
export function insertTransaction(
  data: Omit<TransactionRecord, 'id' | 'createdAt' | 'updatedAt'>
): TransactionRecord {
  const id = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const now = new Date().toISOString();
  const record: TransactionRecord = { ...data, id, createdAt: now, updatedAt: now };
  transactionTable.set(record.id, record);
  return record;
}

/**
 * List transactions with optional filtering and pagination.
 * @param filters - Optional filter and pagination options.
 * @param filters.borrower - Filter by borrower address.
 * @param filters.type - Filter by transaction type.
 * @param filters.status - Filter by status.
 * @param filters.loanId - Filter by associated loan ID.
 * @param filters.collateralId - Filter by associated collateral ID.
 * @param filters.startDate - ISO date string lower bound for `createdAt`.
 * @param filters.endDate - ISO date string upper bound for `createdAt`.
 * @param filters.page - Page number (1-indexed, default 1).
 * @param filters.pageSize - Records per page (default 20).
 * @returns Paginated result with `data`, `total`, `page`, and `pageSize`.
 */
export function listTransactions(filters?: {
  borrower?: string;
  type?: TransactionType;
  status?: TransactionStatus;
  loanId?: string;
  collateralId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}): { data: TransactionRecord[]; total: number; page: number; pageSize: number } {
  const pageSize = filters?.pageSize || 20;
  const page = filters?.page || 1;

  let results = [...transactionTable.values()];

  if (filters?.borrower) results = results.filter((t) => t.borrower === filters.borrower);
  if (filters?.type) results = results.filter((t) => t.type === filters.type);
  if (filters?.status) results = results.filter((t) => t.status === filters.status);
  if (filters?.loanId) results = results.filter((t) => t.loanId === filters.loanId);
  if (filters?.collateralId)
    results = results.filter((t) => t.collateralId === filters.collateralId);
  if (filters?.startDate)
    results = results.filter((t) => new Date(t.createdAt) >= new Date(filters.startDate!));
  if (filters?.endDate)
    results = results.filter((t) => new Date(t.createdAt) <= new Date(filters.endDate!));

  // Sort by date descending (newest first)
  results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const total = results.length;
  const start = (page - 1) * pageSize;
  const data = results.slice(start, start + pageSize);

  return { data, total, page, pageSize };
}

/**
 * Fetch a single transaction record by ID.
 * @param id - Transaction ID.
 * @returns The {@link TransactionRecord} or `undefined` if not found.
 */
export function getTransaction(id: string): TransactionRecord | undefined {
  return transactionTable.get(id);
}

/**
 * Update fields on an existing transaction record.
 * @param id - Transaction ID.
 * @param updates - Partial fields to merge (excluding `id` and `createdAt`).
 * @returns The updated {@link TransactionRecord}, or `undefined` if not found.
 */
export function updateTransaction(
  id: string,
  updates: Partial<Omit<TransactionRecord, 'id' | 'createdAt'>>
): TransactionRecord | undefined {
  const record = transactionTable.get(id);
  if (!record) return undefined;
  const updated = { ...record, ...updates, updatedAt: new Date().toISOString() };
  transactionTable.set(id, updated);
  return updated;
}

// ── Liquidation Events ────────────────────────────────────────────────────────

export interface LiquidationEvent {
  id: string;
  loan_id: string;
  liquidator: string;
  repay_amount: number;
  timestamp: string;
}

const liquidationEventTable: Map<string, LiquidationEvent> = new Map();

/**
 * Record a liquidation event.
 * @param data - Liquidation event fields excluding `id` and `timestamp`.
 * @returns The created {@link LiquidationEvent}.
 */
export function insertLiquidationEvent(
  data: Omit<LiquidationEvent, 'id' | 'timestamp'>
): LiquidationEvent {
  const id = `liq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const record: LiquidationEvent = { ...data, id, timestamp: new Date().toISOString() };
  liquidationEventTable.set(id, record);
  return record;
}

/**
 * List all liquidation events for a given loan.
 * @param loan_id - Loan record ID.
 * @returns Array of {@link LiquidationEvent} objects for the given loan.
 */
export function getLiquidationEvents(loan_id: string): LiquidationEvent[] {
  return [...liquidationEventTable.values()].filter((e) => e.loan_id === loan_id);
}

// ── Audit Log ─────────────────────────────────────────────────────────────────

export interface AuditEntry {
  id: string;
  userId: string;
  action: string;
  resource: string;
  resourceId: string;
  requestBody?: unknown;
  ip?: string;
  timestamp: string;
}

const auditTable: Map<string, AuditEntry> = new Map();

/**
 * Insert an audit log entry.
 * @param data - Audit entry fields excluding `id` and `timestamp`.
 * @returns The created {@link AuditEntry}.
 */
export function insertAuditEntry(
  data: Omit<AuditEntry, 'id' | 'timestamp'>
): AuditEntry {
  const id = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const record: AuditEntry = { ...data, id, timestamp: new Date().toISOString() };
  auditTable.set(id, record);
  return record;
}

/**
 * List audit entries with optional filtering and pagination.
 * @param filters - Optional filter and pagination options.
 * @param filters.userId - Filter by user ID.
 * @param filters.action - Filter by action.
 * @param filters.resource - Filter by resource type.
 * @param filters.from - Filter by start timestamp (ISO string).
 * @param filters.to - Filter by end timestamp (ISO string).
 * @param filters.page - Page number (1-indexed, default 1).
 * @param filters.limit - Records per page (default 20, max 100).
 * @returns Paginated result with `data`, `total`, `page`, and `limit`.
 */
export function listAuditEntries(filters?: {
  userId?: string;
  action?: string;
  resource?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}): { data: AuditEntry[]; total: number; page: number; limit: number } {
  const limit = Math.min(filters?.limit || 20, 100);
  const page = Math.max(filters?.page || 1, 1);

  let results = [...auditTable.values()];

  if (filters?.userId) results = results.filter((a) => a.userId === filters.userId);
  if (filters?.action) results = results.filter((a) => a.action === filters.action);
  if (filters?.resource) results = results.filter((a) => a.resource === filters.resource);
  if (filters?.from)
    results = results.filter((a) => new Date(a.timestamp) >= new Date(filters.from!));
  if (filters?.to)
    results = results.filter((a) => new Date(a.timestamp) <= new Date(filters.to!));

  // Sort by timestamp descending (newest first)
  results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const total = results.length;
  const start = (page - 1) * limit;
  const data = results.slice(start, start + limit);

  return { data, total, page, limit };
}

// ── User Profiles ─────────────────────────────────────────────────────────────

export interface UserProfile {
  walletAddress: string;
  displayName?: string;
  notificationPreferences?: {
    loanApproved?: boolean;
    loanRepaid?: boolean;
    liquidationWarning?: boolean;
    loanDisbursed?: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

const profileTable: Map<string, UserProfile> = new Map();

/**
 * Get a user profile by wallet address.
 * @param walletAddress - Stellar wallet address.
 * @returns The {@link UserProfile} or `undefined` if not found.
 */
export function getProfile(walletAddress: string): UserProfile | undefined {
  return profileTable.get(walletAddress);
}

/**
 * Create or update a user profile.
 * @param walletAddress - Stellar wallet address.
 * @param updates - Profile fields to set or update.
 * @returns The created or updated {@link UserProfile}.
 */
export function updateProfile(
  walletAddress: string,
  updates: Partial<Omit<UserProfile, 'walletAddress' | 'createdAt'>>
): UserProfile {
  const existing = profileTable.get(walletAddress);
  const now = new Date().toISOString();

  if (existing) {
    const updated: UserProfile = {
      ...existing,
      ...updates,
      updatedAt: now,
    };
    profileTable.set(walletAddress, updated);
    return updated;
  }

  const profile: UserProfile = {
    walletAddress,
    createdAt: now,
    updatedAt: now,
    ...updates,
  };
  profileTable.set(walletAddress, profile);
  return profile;
}

// ── Ledger Cursor (event listener replay) ────────────────────────────────────

/**
 * In-memory ledger cursor store.
 * Maps a cursor key (e.g. contract ID) to the last processed ledger sequence.
 * On restart this is initialised from DB-backed storage or defaults to 0.
 */
const ledgerCursorTable: Map<string, number> = new Map();

/**
 * Persist the last processed ledger sequence for a given cursor key.
 * Called by the contract event listener after successfully processing events
 * so that on restart the listener can replay from this point.
 *
 * @param key   - Identifier for the cursor, typically the contract ID.
 * @param ledger - Last ledger sequence number that was fully processed.
 */
export function setLedgerCursor(key: string, ledger: number): void {
  ledgerCursorTable.set(key, ledger);
}

/**
 * Retrieve the last persisted ledger cursor for a given key.
 * Returns `0` when no cursor has been recorded (start from the beginning).
 *
 * @param key - Identifier for the cursor, typically the contract ID.
 * @returns The last persisted ledger sequence, or `0` if not yet set.
 */
export function getLedgerCursor(key: string): number {
  return ledgerCursorTable.get(key) ?? 0;
}
