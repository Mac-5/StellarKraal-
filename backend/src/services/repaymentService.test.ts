import { withDbTransaction } from '../db/database';
import rpcClient from '../utils/rpcClient';
import { submitLoanRepayment } from './repaymentService';
import type { Transaction } from '@stellar/stellar-sdk';

jest.mock('../db/database', () => ({ activeDriver: 'pg', withDbTransaction: jest.fn() }));
jest.mock('../utils/rpcClient', () => ({
  __esModule: true,
  default: { sendTransaction: jest.fn(), getTransaction: jest.fn() },
}));
jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

describe('PostgreSQL repayment row locking', () => {
  const query = jest.fn();
  const mockTransaction = withDbTransaction as jest.Mock;
  const mockSend = rpcClient.sendTransaction as jest.Mock;
  const transaction = { hash: () => Buffer.from('transaction') } as unknown as Transaction;

  beforeEach(() => {
    jest.clearAllMocks();
    mockTransaction.mockImplementation(async (work) => work({ query }));
    mockSend.mockResolvedValue({ hash: 'network-hash', status: 'PENDING' });
  });

  it('locks the loan before reading submission state or calling the network', async () => {
    const order: string[] = [];
    query.mockImplementation(async (sql: string) => {
      order.push(sql);
      if (sql.includes('FROM loans')) return [{ id: 1, status: 'active', deleted_at: null }];
      return [];
    });
    mockSend.mockImplementation(async () => {
      order.push('RPC');
      return { hash: 'network-hash', status: 'PENDING' };
    });
    await expect(submitLoanRepayment('1', transaction)).resolves.toEqual({ hash: 'network-hash', status: 'PENDING' });
    expect(query.mock.calls[0]).toEqual(['SELECT * FROM loans WHERE id = $1 FOR UPDATE', ['1']]);
    expect(order[0]).toContain('FOR UPDATE');
    expect(order.indexOf('RPC')).toBe(2);
    expect(order[3]).toContain('INSERT INTO loan_repayment_submissions');
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it('checks terminal status only after locking, then rejects without submission', async () => {
    query.mockResolvedValue([{ id: 1, status: 'repaid', deleted_at: null }]);
    await expect(submitLoanRepayment('1', transaction)).rejects.toMatchObject({ statusCode: 409 });
    expect(query).toHaveBeenCalledWith('SELECT * FROM loans WHERE id = $1 FOR UPDATE', ['1']);
    expect(query).toHaveBeenCalledTimes(1);
    expect(mockSend).not.toHaveBeenCalled();
  });
});
