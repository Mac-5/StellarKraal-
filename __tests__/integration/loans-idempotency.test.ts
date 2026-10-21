import request from 'supertest';
import app from '../../src/app';
import { db } from '../../src/config/database';

describe('POST /api/v1/loans/:id/repay - Idempotency', () => {
  let authToken: string;
  let userId: string;
  let loanId: string;
  const idempotencyKey = 'test-repay-idempotency-key-001';

  beforeAll(async () => {
    // Setup test user, auth token, and an active loan to repay
    // This should be implemented based on your auth setup
  });

  afterAll(async () => {
    // Clean up test data
    await db('idempotency_records').where('request_id', 'like', '%test-repay%').delete();
  });

  describe('Idempotency Key Header', () => {
    it('should require Idempotency-Key header', async () => {
      const response = await request(app)
        .post(`/api/v1/loans/${loanId}/repay`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ amount: 100 });

      expect(response.status).toBe(422);
      expect(response.body).toHaveProperty('error');
      expect(response.body.message).toContain('Idempotency-Key header is required');
    });

    it('should reject empty idempotency key', async () => {
      const response = await request(app)
        .post(`/api/v1/loans/${loanId}/repay`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', '')
        .send({ amount: 100 });

      expect(response.status).toBe(422);
      expect(response.body).toHaveProperty('error');
      expect(response.body.message).toContain('non-empty string');
    });
  });

  describe('Idempotent Replay Behavior', () => {
    it('should return original response for duplicate request with same key', async () => {
      const repayData = { amount: 100 };

      // First request - should succeed
      const firstResponse = await request(app)
        .post(`/api/v1/loans/${loanId}/repay`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(repayData);

      expect(firstResponse.status).toBe(200);
      expect(firstResponse.body).toHaveProperty('success', true);

      // Second request with same key - should return cached response
      const secondResponse = await request(app)
        .post(`/api/v1/loans/${loanId}/repay`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(repayData);

      expect(secondResponse.status).toBe(firstResponse.status);
      expect(secondResponse.body).toEqual(firstResponse.body);
    });

    it('should create only one repayment for duplicate requests', async () => {
      const key = 'test-repay-idempotency-key-002';
      const repayData = { amount: 200 };

      const before = await db('repayments').where('loan_id', loanId).count('* as count');

      // First request
      await request(app)
        .post(`/api/v1/loans/${loanId}/repay`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', key)
        .send(repayData);

      // Second request with same key
      await request(app)
        .post(`/api/v1/loans/${loanId}/repay`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', key)
        .send(repayData);

      const after = await db('repayments').where('loan_id', loanId).count('* as count');

      // Only one repayment should have been created
      expect(Number(after[0].count) - Number(before[0].count)).toBe(1);
    });
  });

  describe('Different Keys', () => {
    it('should create separate repayments for different idempotency keys', async () => {
      const key1 = 'test-repay-idempotency-key-003';
      const key2 = 'test-repay-idempotency-key-004';
      const repayData = { amount: 50 };

      const response1 = await request(app)
        .post(`/api/v1/loans/${loanId}/repay`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', key1)
        .send(repayData);

      const response2 = await request(app)
        .post(`/api/v1/loans/${loanId}/repay`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', key2)
        .send(repayData);

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
      expect(response1.body.data.id).not.toBe(response2.body.data.id);
    });
  });

  describe('Key Expiry', () => {
    it('should expire keys after 24 hours', async () => {
      const key = 'test-repay-idempotency-key-005';
      const repayData = { amount: 75 };

      // First request
      await request(app)
        .post(`/api/v1/loans/${loanId}/repay`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', key)
        .send(repayData);

      // Manually expire the key (for testing purposes)
      await db('idempotency_records')
        .where('request_id', 'like', `%${key}%`)
        .update({ expires_at: new Date(Date.now() - 1000) });

      // Second request with expired key should create a new repayment
      const response = await request(app)
        .post(`/api/v1/loans/${loanId}/repay`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', key)
        .send(repayData);

      expect(response.status).toBe(200);
    });
  });

  describe('Error Scenarios', () => {
    it('should handle malformed idempotency key', async () => {
      const response = await request(app)
        .post(`/api/v1/loans/${loanId}/repay`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', '   ')
        .send({ amount: 100 });

      expect(response.status).toBe(422);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Atomic Transaction Rollback', () => {
    const collateralId = 'col-atomic-001';
    const loanData = {
      amount: 5000,
      collateralId,
      terms: { duration: 30, interestRate: 0.05 }
    };

    afterEach(async () => {
      jest.restoreAllMocks();
      await db('loans').where('collateral_id', collateralId).delete();
      await db('collaterals').where('id', collateralId).update({ locked: false });
    });

    it('should roll back loan creation when collateral lock fails mid-transaction', async () => {
      const key = 'test-idempotency-key-atomic-001';

      // Simulate a mid-transaction failure after the loan row is inserted
      const originalTransaction = db.transaction.bind(db);
      jest.spyOn(db, 'transaction').mockImplementation(async (cb: any) => {
        return originalTransaction(async (trx: any) => {
          const originalInsert = trx.insert.bind(trx);
          let loanInserted = false;
          trx.insert = (data: any) => {
            const builder = originalInsert(data);
            if (!loanInserted) {
              loanInserted = true;
              // Fail on the subsequent collateral lock write
              const originalUpdate = trx.update.bind(trx);
              trx.update = () => {
                throw new Error('simulated collateral lock failure');
              };
              void originalUpdate;
            }
            return builder;
          };
          return cb(trx);
        });
      });

      const response = await request(app)
        .post('/api/v1/loans')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', key)
        .send(loanData);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('correlationId');

      // No partial state should be persisted
      const persistedLoans = await db('loans').where('collateral_id', collateralId);
      expect(persistedLoans).toHaveLength(0);

      const collateral = await db('collaterals').where('id', collateralId).first();
      expect(collateral?.locked).toBe(false);
    });

    it('should roll back liquidation when event logging fails mid-transaction', async () => {
      const key = 'test-idempotency-key-atomic-002';

      // Create a loan to liquidate
      const created = await request(app)
        .post('/api/v1/loans')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', key)
        .send(loanData);

      expect(created.status).toBe(201);
      const loanId = created.body.data.id;

      // Simulate a failure while logging the liquidation event
      const originalTransaction = db.transaction.bind(db);
      jest.spyOn(db, 'transaction').mockImplementation(async (cb: any) => {
        return originalTransaction(async (trx: any) => {
          const originalInsert = trx.insert.bind(trx);
          trx.insert = (data: any) => {
            if (data && data.event_type === 'loan_liquidated') {
              throw new Error('simulated event log failure');
            }
            return originalInsert(data);
          };
          return cb(trx);
        });
      });

      const response = await request(app)
        .post(`/api/v1/loans/${loanId}/liquidate`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ reason: 'test liquidation' });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('correlationId');

      // Loan status must remain unchanged and collateral must stay locked
      const loan = await db('loans').where('id', loanId).first();
      expect(loan?.status).not.toBe('liquidated');

      const collateral = await db('collaterals').where('id', collateralId).first();
      expect(collateral?.locked).toBe(true);

      const events = await db('loan_events')
        .where({ loan_id: loanId, event_type: 'loan_liquidated' });
      expect(events).toHaveLength(0);
    });
  });
});
