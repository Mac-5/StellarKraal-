import request from 'supertest';
import express from 'express';
import { createHash } from 'crypto';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import rpcClient from '../utils/rpcClient';
import { withDbConnection } from '../db/database';
import { errorHandler } from '../middleware/errorHandler';
import { loanRepaymentRouter } from './loanRepayment';

jest.mock('@stellar/stellar-sdk', () => ({
  TransactionBuilder: {
    fromXDR: (xdr: string) => {
      if (xdr === 'invalid_xdr_string') throw new Error('Invalid XDR');
      return {
        operations: xdr === 'empty_ops_xdr' ? [] : [{ type: 'invokeHostFunction' }],
        hash: () => require('crypto').createHash('sha256').update(xdr).digest(),
      };
    },
  },
  Networks: { TESTNET: 'testnet', PUBLIC: 'public' },
}));

jest.mock('../utils/rpcClient', () => ({
  __esModule: true,
  default: { sendTransaction: jest.fn(), getTransaction: jest.fn() },
}));

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const app = express();
app.use(express.json());
app.use('/api/v1', loanRepaymentRouter);
app.use(errorHandler);

const mockSend = rpcClient.sendTransaction as jest.Mock;
const mockGetTransaction = rpcClient.getTransaction as jest.Mock;
const hash = (xdr: string) => createHash('sha256').update(xdr).digest('hex');

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('POST /api/v1/loans/:id/repay locked XDR submission', () => {
  const previousDbFile = process.env.DB_FILE;
  let directory: string;

  beforeEach(async () => {
    jest.clearAllMocks();
    directory = mkdtempSync(path.join(tmpdir(), 'stellarkraal-repayment-'));
    process.env.DB_FILE = path.join(directory, 'loans.sqlite3');
    await withDbConnection(async (db) => {
      await db.query('CREATE TABLE loans (id TEXT PRIMARY KEY, status TEXT NOT NULL, deleted_at INTEGER)');
      await db.query('INSERT INTO loans (id, status) VALUES ($1, $2)', ['loan-test-1', 'active']);
      await db.query(readFileSync(path.join(__dirname, '../../migrations/sqls/20261016000001-add-loan-repayment-submissions-up.sql'), 'utf8'));
    });
    mockSend.mockImplementation(async (tx) => ({ hash: tx.hash().toString('hex'), status: 'PENDING' }));
    mockGetTransaction.mockResolvedValue({ status: 'NOT_FOUND' });
  });

  afterEach(() => {
    if (previousDbFile === undefined) delete process.env.DB_FILE;
    else process.env.DB_FILE = previousDbFile;
    rmSync(directory, { recursive: true, force: true });
  });

  const repay = (signedXdr = 'valid_xdr_string', loanId = 'loan-test-1') =>
    request(app).post(`/api/v1/loans/${loanId}/repay`).send({ signedXdr });

  it('submits valid XDR and persists a guard without prematurely marking the loan repaid', async () => {
    const response = await repay();
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ hash: hash('valid_xdr_string'), status: 'PENDING' });
    const rows = await withDbConnection((db) => db.query('SELECT * FROM loan_repayment_submissions'));
    expect(rows).toEqual([{ loan_id: 'loan-test-1', tx_hash: hash('valid_xdr_string') }]);
    const loans = await withDbConnection((db) => db.query<{ status: string }>('SELECT status FROM loans'));
    expect(loans[0].status).toBe('active');
  });

  it.each([
    ['invalid_xdr_string', 'Invalid XDR structure'],
    ['empty_ops_xdr', 'Transaction contains no operations'],
  ])('rejects %s before submission', async (xdr, message) => {
    const response = await repay(xdr);
    expect(response.status).toBe(400);
    expect(response.body.error).toBe(message);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown loan', async () => {
    expect((await repay('valid_xdr_string', 'missing')).status).toBe(404);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it.each(['repaid', 'liquidated'])('returns 409 for a %s loan', async (status) => {
    await withDbConnection(async (db) => { await db.query('UPDATE loans SET status = $1', [status]); });
    expect((await repay()).status).toBe(409);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('serializes concurrent requests and returns 409 to the second without double submission', async () => {
    const entered = deferred();
    const release = deferred();
    mockSend.mockImplementationOnce(async (tx) => {
      entered.resolve();
      await release.promise;
      return { hash: tx.hash().toString('hex'), status: 'PENDING' };
    });
    const first = repay('first_signed_xdr').then((response) => response);
    await entered.promise;
    const second = repay('second_signed_xdr').then((response) => response);
    // This separate connection cannot acquire a SQLite write lock while the
    // first request is awaiting RPC, proving the transaction spans submission.
    await expect(withDbConnection(async (db) => {
      await db.query('PRAGMA busy_timeout = 0');
      await db.query('BEGIN IMMEDIATE');
      await db.query('ROLLBACK');
    })).rejects.toThrow(/locked|busy/i);
    release.resolve();
    const [one, two] = await Promise.all([first, second]);
    expect(one.status).toBe(200);
    expect(two.status).toBe(409);
    expect(two.body.code).toBe('CONFLICT');
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('rejects replay of the same signed transaction after the first request completes', async () => {
    expect((await repay()).status).toBe(200);
    expect((await repay()).status).toBe(409);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('rolls back and releases the lock when RPC submission throws', async () => {
    mockSend.mockRejectedValueOnce(new Error('RPC unavailable'));
    expect((await repay()).status).toBe(500);
    const rows = await withDbConnection((db) => db.query('SELECT * FROM loan_repayment_submissions'));
    expect(rows).toEqual([]);
    expect((await repay('retry_signed_xdr')).status).toBe(200);
  });

  it('does not commit a pending guard when the network rejects a transaction', async () => {
    mockSend.mockResolvedValueOnce({ hash: hash('valid_xdr_string'), status: 'ERROR' });
    expect((await repay()).status).toBe(502);
    expect((await repay('retry_signed_xdr')).status).toBe(200);
  });

  it('allows a new partial repayment after a previous submission is confirmed', async () => {
    expect((await repay()).status).toBe(200);
    mockGetTransaction.mockResolvedValueOnce({ status: 'SUCCESS' });
    expect((await repay('next_partial_payment')).status).toBe(200);
    expect(mockSend).toHaveBeenCalledTimes(2);
  });
});
