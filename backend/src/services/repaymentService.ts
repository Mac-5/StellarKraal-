import type { Transaction } from '@stellar/stellar-sdk';
import { activeDriver, withDbTransaction } from '../db/database';
import { getLoan } from '../db/store';
import { AppError } from '../middleware/errorHandler';
import rpcClient from '../utils/rpcClient';

interface RepaymentLoan {
  id: string | number;
  status?: string;
  deleted_at?: number | null;
  deletedAt?: string | null;
}

/**
 * Serialize repayment checks and submission on the same database connection.
 * PostgreSQL locks the loan row; SQLite holds its equivalent BEGIN IMMEDIATE
 * write lock. The development memory store is consulted only while that lock
 * is held, when no SQL loan row has been persisted yet.
 */
export async function submitLoanRepayment(
  loanId: string,
  transaction: Transaction
): Promise<{ hash: string; status: string }> {
  return withDbTransaction(async (db) => {
    const rows = await db.query<RepaymentLoan>(
      'SELECT * FROM loans WHERE id = $1' + (activeDriver === 'pg' ? ' FOR UPDATE' : ''),
      [loanId]
    );
    const loan: RepaymentLoan | undefined = rows[0] ?? (activeDriver === 'sqlite' ? getLoan(loanId) : undefined);
    if (!loan || loan.deleted_at != null || loan.deletedAt != null) {
      throw new AppError(404, 'Loan not found', 'NOT_FOUND');
    }
    if (loan.status !== 'active' && loan.status !== 'at_risk') {
      throw new AppError(409, 'Loan is not available for repayment', 'CONFLICT');
    }

    // Keep a committed guard while confirmation is asynchronous: releasing the
    // row lock must not allow a queued request to resubmit the same repayment.
    const [pending] = await db.query<{ tx_hash: string }>(
      'SELECT tx_hash FROM loan_repayment_submissions WHERE loan_id = $1',
      [loanId]
    );
    if (pending) {
      const hash = transaction.hash().toString('hex');
      if (hash === pending.tx_hash) {
        throw new AppError(409, 'Repayment has already been submitted', 'CONFLICT');
      }
      const previous = await rpcClient.getTransaction(pending.tx_hash);
      if (previous.status !== 'SUCCESS' && previous.status !== 'FAILED') {
        throw new AppError(409, 'A repayment is already pending for this loan', 'CONFLICT');
      }
      // Confirmed partial repayments may be followed by a new repayment, and a
      // definitively failed submission may be retried with a new transaction.
    }

    const response = await rpcClient.sendTransaction(transaction);
    if (response.status !== 'PENDING' && response.status !== 'DUPLICATE') {
      throw new AppError(502, 'Repayment transaction was not accepted by the network', 'RPC_ERROR');
    }
    await db.query(
      'INSERT INTO loan_repayment_submissions (loan_id, tx_hash) VALUES ($1, $2) ' +
        'ON CONFLICT (loan_id) DO UPDATE SET tx_hash = EXCLUDED.tx_hash',
      [loanId, response.hash]
    );
    // Contract event synchronization remains responsible for confirmed balances
    // and terminal statuses; a pending network submission is not marked repaid.
    return { hash: response.hash, status: response.status };
  });
}
