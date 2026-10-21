/**
 * Comprehensive integration tests for API v1 endpoints
 * Covers all 5 main endpoints: register, request, repay, liquidate, health
 * Tests happy paths, edge cases, and error scenarios
 */
import request from 'supertest';
import express, { Express } from 'express';
import { v1Router } from './v1';
import { insertCollateral, insertLoan } from '../db/store';
import { __resetForTests } from '../webhooks';

const VALID_ADDRESS = 'GASPH4OCYOERATXIKLPNURXUP7ISAQU2KWFB5XLUJ3LQHKHOCN3CEGD6';
const INVALID_ADDRESS = 'INVALID_KEY';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  createRequestLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

jest.mock('@stellar/stellar-sdk', () => ({
  Networks: {
      TESTNET: 'Test SDF Network ; September 2015',
      PUBLIC: 'Public Global Stellar Network ; September 2015',
    },
    BASE_FEE: '100',
    Contract: jest.fn().mockImplementation(() => ({
      call: jest.fn().mockReturnValue({ type: 'invokeHostFunction' }),
    })),
    TransactionBuilder: jest.fn().mockImplementation(() => ({
      addOperation: jest.fn().mockReturnThis(),
      setTimeout: jest.fn().mockReturnThis(),
      build: jest.fn().mockReturnValue({ toXDR: () => 'mock_xdr_base64' }),
    })),
    Address: jest.fn().mockImplementation(() => ({
      toScVal: jest.fn().mockReturnValue({}),
    })),
    nativeToScVal: jest.fn().mockReturnValue({}),
    scValToNative: jest.fn().mockReturnValue({}),
    StrKey: {
      isValidEd25519PublicKey: jest.fn((key: string) => typeof key === 'string' && key.startsWith('G') && key.length === 56),
    },
    xdr: {
      ScVal: {
        scvVec: jest.fn((arr) => ({ type: 'vec', value: arr })),
        scvVoid: jest.fn().mockReturnValue({}),
      },
    },
    rpc: {
      Server: jest.fn().mockImplementation(() => ({
        getAccount: jest
          .fn()
          .mockResolvedValue({
            id: 'GASPH4OCYOERATXIKLPNURXUP7ISAQU2KWFB5XLUJ3LQHKHOCN3CEGD6',
            sequence: '1',
          }),
        prepareTransaction: jest.fn().mockResolvedValue({ toXDR: () => 'prepared_xdr' }),
        simulateTransaction: jest.fn().mockResolvedValue({
          result: { retval: { value: 150 } },
        }),
        getHealth: jest.fn().mockResolvedValue({ status: 'healthy' }),
      })),
    },
    SorobanRpc: {
      Server: jest.fn().mockImplementation(() => ({
        getAccount: jest
          .fn()
          .mockResolvedValue({
            id: 'GASPH4OCYOERATXIKLPNURXUP7ISAQU2KWFB5XLUJ3LQHKHOCN3CEGD6',
            sequence: '1',
          }),
        prepareTransaction: jest.fn().mockResolvedValue({ toXDR: () => 'prepared_xdr' }),
        simulateTransaction: jest.fn().mockResolvedValue({
          result: { retval: { value: 150 } },
        }),
        getHealth: jest.fn().mockResolvedValue({ status: 'healthy' }),
      })),
    },
  }));

// ── Test App Setup ────────────────────────────────────────────────────────────

function createTestApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', v1Router);
  return app;
}

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('API v1 Integration Tests', () => {
  let app: Express;

  beforeEach(() => {
    app = createTestApp();
  });

  // ── Version Envelope ──────────────────────────────────────────────────────

  describe('Version envelope', () => {
    it('includes api_version in all responses', async () => {
      const res = await request(app).get('/api/v1/health');
      expect(res.body).toHaveProperty('api_version', 'v1');
    });

    it('includes api_version in error responses', async () => {
      const res = await request(app).post('/api/v1/collateral/register').send({});
      expect(res.body).toHaveProperty('api_version', 'v1');
    });
  });

  // ── Health Check ──────────────────────────────────────────────────────────

  describe('GET /api/v1/health', () => {
    it('returns 200 with healthy status', async () => {
      const res = await request(app).get('/api/v1/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
      expect(res.body).toHaveProperty('version');
      expect(res.body).toHaveProperty('uptime');
      expect(res.body.rpcReachable).toBe(true);
    });
  });

  // ── 1. Register Collateral ────────────────────────────────────────────────

  describe('POST /api/v1/collateral/register', () => {
    const validPayload = {
      owner: VALID_ADDRESS,
      animal_type: 'cattle',
      count: 5,
      appraised_value: 1_000_000,
    };

    it('happy path: registers collateral and returns XDR', async () => {
      const res = await request(app).post('/api/v1/collateral/register').send(validPayload);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('xdr');
      expect(res.body).toHaveProperty('api_version', 'v1');
      expect(typeof res.body.xdr).toBe('string');
    });

    it('happy path: accepts different animal types', async () => {
      for (const animal_type of ['cattle', 'goat', 'sheep']) {
        const res = await request(app)
          .post('/api/v1/collateral/register')
          .send({ ...validPayload, animal_type });
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('xdr');
      }
    });

    it('error: missing required fields returns 400', async () => {
      const res = await request(app).post('/api/v1/collateral/register').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
      expect(Array.isArray(res.body.details)).toBe(true);
    });

    it('error: invalid Stellar public key returns 400', async () => {
      const res = await request(app)
        .post('/api/v1/collateral/register')
        .send({ ...validPayload, owner: INVALID_ADDRESS });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('error: non-positive count returns 400', async () => {
      const res = await request(app)
        .post('/api/v1/collateral/register')
        .send({ ...validPayload, count: 0 });
      expect(res.status).toBe(400);
    });

    it('error: negative count returns 400', async () => {
      const res = await request(app)
        .post('/api/v1/collateral/register')
        .send({ ...validPayload, count: -5 });
      expect(res.status).toBe(400);
    });

    it('error: non-positive appraised_value returns 400', async () => {
      const res = await request(app)
        .post('/api/v1/collateral/register')
        .send({ ...validPayload, appraised_value: -100 });
      expect(res.status).toBe(400);
    });

    it('error: empty animal_type returns 400', async () => {
      const res = await request(app)
        .post('/api/v1/collateral/register')
        .send({ ...validPayload, animal_type: '' });
      expect(res.status).toBe(400);
    });

    it('error: non-integer count returns 400', async () => {
      const res = await request(app)
        .post('/api/v1/collateral/register')
        .send({ ...validPayload, count: 5.5 });
      expect(res.status).toBe(400);
    });
  });

  // ── 2. Request Loan ───────────────────────────────────────────────────────

  describe('POST /api/v1/loan/request', () => {
    const validPayload = {
      borrower: VALID_ADDRESS,
      collateral_ids: [1, 2],
      amount: 600_000,
    };

    it('happy path: requests loan with multiple collateral IDs', async () => {
      const res = await request(app).post('/api/v1/loan/request').send(validPayload);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('xdr');
      expect(res.body).toHaveProperty('api_version', 'v1');
    });

    it('happy path: accepts single collateral ID', async () => {
      const res = await request(app)
        .post('/api/v1/loan/request')
        .send({ ...validPayload, collateral_ids: [1] });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('xdr');
    });

    it('error: empty collateral_ids array returns 400', async () => {
      const res = await request(app)
        .post('/api/v1/loan/request')
        .send({ ...validPayload, collateral_ids: [] });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('error: missing borrower returns 400', async () => {
      const res = await request(app)
        .post('/api/v1/loan/request')
        .send({ collateral_ids: [1], amount: 600_000 });
      expect(res.status).toBe(400);
    });

    it('error: invalid Stellar public key returns 400', async () => {
      const res = await request(app)
        .post('/api/v1/loan/request')
        .send({ ...validPayload, borrower: INVALID_ADDRESS });
      expect(res.status).toBe(400);
    });

    it('error: negative amount returns 400', async () => {
      const res = await request(app)
        .post('/api/v1/loan/request')
        .send({ ...validPayload, amount: -1 });
      expect(res.status).toBe(400);
    });

    it('error: zero amount returns 400', async () => {
      const res = await request(app)
        .post('/api/v1/loan/request')
        .send({ ...validPayload, amount: 0 });
      expect(res.status).toBe(400);
    });

    it('error: negative collateral_id returns 400', async () => {
      const res = await request(app)
        .post('/api/v1/loan/request')
        .send({ ...validPayload, collateral_ids: [-1] });
      expect(res.status).toBe(400);
    });
  });

  // ── 3. Repay Loan ─────────────────────────────────────────────────────────

  describe('POST /api/v1/loan/repay', () => {
    const validPayload = {
      borrower: VALID_ADDRESS,
      loan_id: 1,
      amount: 200_000,
    };

    it('happy path: partial repayment returns XDR', async () => {
      const res = await request(app).post('/api/v1/loan/repay').send(validPayload);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('xdr');
      expect(res.body).toHaveProperty('api_version', 'v1');
    });

    it('happy path: full repayment returns XDR', async () => {
      const res = await request(app)
        .post('/api/v1/loan/repay')
        .send({ ...validPayload, amount: 600_000 });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('xdr');
    });

    it('error: missing loan_id returns 400', async () => {
      const res = await request(app)
        .post('/api/v1/loan/repay')
        .send({ borrower: VALID_ADDRESS, amount: 200_000 });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('error: invalid Stellar public key returns 400', async () => {
      const res = await request(app)
        .post('/api/v1/loan/repay')
        .send({ ...validPayload, borrower: 'NOT_VALID' });
      expect(res.status).toBe(400);
    });

    it('error: zero amount returns 400', async () => {
      const res = await request(app)
        .post('/api/v1/loan/repay')
        .send({ ...validPayload, amount: 0 });
      expect(res.status).toBe(400);
    });

    it('error: negative amount returns 400', async () => {
      const res = await request(app)
        .post('/api/v1/loan/repay')
        .send({ ...validPayload, amount: -100 });
      expect(res.status).toBe(400);
    });

    it('error: negative loan_id returns 400', async () => {
      const res = await request(app)
        .post('/api/v1/loan/repay')
        .send({ ...validPayload, loan_id: -1 });
      expect(res.status).toBe(400);
    });
  });

  // ── 4. Liquidate Loan ─────────────────────────────────────────────────────

  describe('POST /api/v1/loan/liquidate', () => {
    // Seed a liquidatable loan: collateral 700_000, loan 600_000 → HF = 9_333 (< 10_000)
    beforeEach(() => {
      insertCollateral({
        id: 'v1-liq-col',
        owner: VALID_ADDRESS,
        animal_type: 'cattle',
        count: 5,
        appraised_value: 700_000,
      });
      insertLoan({
        id: '42',
        borrower: VALID_ADDRESS,
        collateral_id: 'v1-liq-col',
        amount: 600_000,
      });
    });

    const validPayload = {
      liquidator: VALID_ADDRESS,
      loan_id: 42,
      repay_amount: 500_000,
    };

    it('happy path: liquidates loan and returns XDR', async () => {
      const res = await request(app).post('/api/v1/loan/liquidate').send(validPayload);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('xdr');
      expect(res.body).toHaveProperty('api_version', 'v1');
    });

    it('error: missing liquidator returns 400', async () => {
      const res = await request(app)
        .post('/api/v1/loan/liquidate')
        .send({ loan_id: 1, repay_amount: 500_000 });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('error: invalid Stellar public key returns 400', async () => {
      const res = await request(app)
        .post('/api/v1/loan/liquidate')
        .send({ ...validPayload, liquidator: INVALID_ADDRESS });
      expect(res.status).toBe(400);
    });

    it('error: negative loan_id returns 400', async () => {
      const res = await request(app)
        .post('/api/v1/loan/liquidate')
        .send({ ...validPayload, loan_id: -1 });
      expect(res.status).toBe(400);
    });

    it('error: zero repay_amount returns 400', async () => {
      const res = await request(app)
        .post('/api/v1/loan/liquidate')
        .send({ ...validPayload, repay_amount: 0 });
      expect(res.status).toBe(400);
    });

    it('error: negative repay_amount returns 400', async () => {
      const res = await request(app)
        .post('/api/v1/loan/liquidate')
        .send({ ...validPayload, repay_amount: -100 });
      expect(res.status).toBe(400);
    });
  });

  // ── 5. Get Loan ───────────────────────────────────────────────────────────

  describe('GET /api/v1/loan/:id', () => {
    it('happy path: returns loan result for valid id', async () => {
      const res = await request(app).get('/api/v1/loan/1');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('result');
      expect(res.body).toHaveProperty('api_version', 'v1');
    });

    it('happy path: returns result for id 0', async () => {
      const res = await request(app).get('/api/v1/loan/0');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('result');
    });

    it('happy path: handles large loan IDs', async () => {
      const res = await request(app).get('/api/v1/loan/999999');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('result');
    });
  });

  // ── 6. Health Factor ──────────────────────────────────────────────────────

  describe('GET /api/v1/health/:loanId', () => {
    it('happy path: returns health_factor for valid loan', async () => {
      const res = await request(app).get('/api/v1/health/1');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('health_factor');
      expect(res.body).toHaveProperty('api_version', 'v1');
    });

    it('happy path: health_factor reflects simulated value', async () => {
      const res = await request(app).get('/api/v1/health/1');
      expect(res.status).toBe(200);
      expect(res.body.health_factor).toBeDefined();
    });

    it('happy path: handles loan ID 0', async () => {
      const res = await request(app).get('/api/v1/health/0');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('health_factor');
    });
  });

  // ── 7. List Loans with Pagination ─────────────────────────────────────────

  describe('GET /api/v1/loans', () => {
    it('happy path: returns paginated loans with default page size', async () => {
      const res = await request(app).get('/api/v1/loans');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('total');
      expect(res.body).toHaveProperty('page', 1);
      expect(res.body).toHaveProperty('pageSize', 20);
      expect(res.body).toHaveProperty('api_version', 'v1');
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('happy path: accepts custom page parameter', async () => {
      const res = await request(app).get('/api/v1/loans?page=2');
      expect(res.status).toBe(200);
      expect(res.body.page).toBe(2);
      expect(res.body.pageSize).toBe(20);
    });

    it('happy path: accepts custom pageSize parameter', async () => {
      const res = await request(app).get('/api/v1/loans?pageSize=50');
      expect(res.status).toBe(200);
      expect(res.body.pageSize).toBe(50);
      expect(res.body.page).toBe(1);
    });

    it('happy path: accepts both page and pageSize parameters', async () => {
      const res = await request(app).get('/api/v1/loans?page=3&pageSize=25');
      expect(res.status).toBe(200);
      expect(res.body.page).toBe(3);
      expect(res.body.pageSize).toBe(25);
    });

    it('error: rejects pageSize > 100 with 400', async () => {
      const res = await request(app).get('/api/v1/loans?pageSize=200');
      expect(res.status).toBe(400);
    });

    it('happy path: returns deprecation headers when no pagination params provided', async () => {
      const res = await request(app).get('/api/v1/loans');
      expect(res.status).toBe(200);
      expect(res.headers).toHaveProperty('deprecation', 'true');
      expect(res.headers).toHaveProperty('sunset');
      expect(res.headers).toHaveProperty('warning');
      expect(res.headers.warning).toContain('Unpaginated loan listing is deprecated');
    });

    it('happy path: does not return deprecation headers when pagination params provided', async () => {
      const res = await request(app).get('/api/v1/loans?page=1&pageSize=20');
      expect(res.status).toBe(200);
      expect(res.headers).not.toHaveProperty('deprecation');
    });

    it('error: invalid page parameter returns 400', async () => {
      const res = await request(app).get('/api/v1/loans?page=0');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid pagination parameters');
    });

    it('error: negative page parameter returns 400', async () => {
      const res = await request(app).get('/api/v1/loans?page=-1');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid pagination parameters');
    });

    it('error: invalid pageSize parameter returns 400', async () => {
      const res = await request(app).get('/api/v1/loans?pageSize=0');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid pagination parameters');
    });

    it('error: negative pageSize parameter returns 400', async () => {
      const res = await request(app).get('/api/v1/loans?pageSize=-10');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid pagination parameters');
    });

    it('error: non-numeric page parameter returns 400', async () => {
      const res = await request(app).get('/api/v1/loans?page=abc');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid pagination parameters');
    });

    it('error: non-numeric pageSize parameter returns 400', async () => {
      const res = await request(app).get('/api/v1/loans?pageSize=xyz');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid pagination parameters');
    });

    it('happy path: returns empty data array when page exceeds total', async () => {
      const res = await request(app).get('/api/v1/loans?page=999');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.page).toBe(999);
    });
  });

  describe('GET /api/v1 resource details', () => {
    it('returns the stable collateral not-found error', async () => {
      const res = await request(app).get('/api/v1/collateral/missing-collateral');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Collateral not found');
    });

    it('returns the stable loan not-found error', async () => {
      const res = await request(app).get('/api/v1/loans/missing-loan');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Loan not found');
    });
  });

  // ── Full Lifecycle ────────────────────────────────────────────────────────

  describe('Full loan lifecycle: register → request → repay → liquidate → health', () => {
    it('completes the full lifecycle without errors', async () => {
      // 1. Register collateral
      const registerRes = await request(app).post('/api/v1/collateral/register').send({
        owner: VALID_ADDRESS,
        animal_type: 'cattle',
        count: 5,
        appraised_value: 1_000_000,
      });
      expect(registerRes.status).toBe(200);
      expect(registerRes.body.xdr).toBeDefined();

      // 2. Request loan
      const loanRes = await request(app)
        .post('/api/v1/loan/request')
        .send({
          borrower: VALID_ADDRESS,
          collateral_ids: [1],
          amount: 600_000,
        });
      expect(loanRes.status).toBe(200);
      expect(loanRes.body.xdr).toBeDefined();

      // 3. Repay loan (partial)
      const repayRes = await request(app).post('/api/v1/loan/repay').send({
        borrower: VALID_ADDRESS,
        loan_id: 1,
        amount: 200_000,
      });
      expect(repayRes.status).toBe(200);
      expect(repayRes.body.xdr).toBeDefined();

      // 4. Check health factor
      const healthRes = await request(app).get('/api/v1/health/1');
      expect(healthRes.status).toBe(200);
      expect(healthRes.body.health_factor).toBeDefined();

      // 5. Liquidate loan — seed a liquidatable loan (HF < 10_000)
      insertCollateral({
        id: 'lifecycle-col',
        owner: VALID_ADDRESS,
        animal_type: 'cattle',
        count: 5,
        appraised_value: 700_000,
      });
      insertLoan({
        id: '1',
        borrower: VALID_ADDRESS,
        collateral_id: 'lifecycle-col',
        amount: 600_000,
      });
      const liquidateRes = await request(app).post('/api/v1/loan/liquidate').send({
        liquidator: VALID_ADDRESS,
        loan_id: 1,
        repay_amount: 400_000,
      });
      expect(liquidateRes.status).toBe(200);
      expect(liquidateRes.body.xdr).toBeDefined();

      // 6. Get loan record
      const loanRecordRes = await request(app).get('/api/v1/loan/1');
      expect(loanRecordRes.status).toBe(200);
      expect(loanRecordRes.body.result).toBeDefined();
    });
  });

  // ── DELETE /api/v1/webhooks/:id ───────────────────────────────────────────

  describe('DELETE /api/v1/webhooks/:id', () => {
    beforeEach(() => {
      __resetForTests();
    });

    it('returns 204 and removes an existing webhook', async () => {
      const createRes = await request(app)
        .post('/api/v1/webhooks')
        .send({ url: 'https://example.com/hook' });
      expect(createRes.status).toBe(201);
      const { id } = createRes.body;

      const deleteRes = await request(app).delete(`/api/v1/webhooks/${id}`);
      expect(deleteRes.status).toBe(204);

      const listRes = await request(app).get('/api/v1/admin/webhooks');
      expect(listRes.body.some((w: { id: string }) => w.id === id)).toBe(false);
    });

    it('returns 404 when the webhook does not exist', async () => {
      const res = await request(app).delete('/api/v1/webhooks/non-existent-id');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Webhook not found');
    });
  });

  // ── Edge Cases ────────────────────────────────────────────────────────────

  describe('Edge cases', () => {
    it('handles very large amounts', async () => {
      const res = await request(app)
        .post('/api/v1/loan/request')
        .send({
          borrower: VALID_ADDRESS,
          collateral_ids: [1],
          amount: 999_999_999_999,
        });
      expect(res.status).toBe(200);
    });

    it('handles multiple collateral IDs', async () => {
      const res = await request(app)
        .post('/api/v1/loan/request')
        .send({
          borrower: VALID_ADDRESS,
          collateral_ids: [1, 2, 3, 4, 5],
          amount: 1_000_000,
        });
      expect(res.status).toBe(200);
    });

    it('rejects malformed JSON', async () => {
      const res = await request(app)
        .post('/api/v1/collateral/register')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');
      expect(res.status).toBe(400);
    });
  });

  // ── Batch Register Collateral ─────────────────────────────────────────────

  describe('POST /api/v1/collateral/register/batch', () => {
    const validItem = {
      owner: VALID_ADDRESS,
      animal_type: 'cattle',
      count: 5,
      appraised_value: 1_000_000,
    };

    it('happy path: returns one XDR per item', async () => {
      const res = await request(app)
        .post('/api/v1/collateral/register/batch')
        .send({ items: [validItem, { ...validItem, animal_type: 'goat', count: 3 }] });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('results');
      expect(Array.isArray(res.body.results)).toBe(true);
      expect(res.body.results).toHaveLength(2);
      res.body.results.forEach((r: { xdr: unknown }) => {
        expect(typeof r.xdr).toBe('string');
      });
    });

    it('happy path: single item batch', async () => {
      const res = await request(app)
        .post('/api/v1/collateral/register/batch')
        .send({ items: [validItem] });

      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(1);
    });

    it('error: empty items array returns 400', async () => {
      const res = await request(app).post('/api/v1/collateral/register/batch').send({ items: [] });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('error: missing items field returns 400', async () => {
      const res = await request(app).post('/api/v1/collateral/register/batch').send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('error: invalid item inside batch returns 400', async () => {
      const res = await request(app)
        .post('/api/v1/collateral/register/batch')
        .send({ items: [{ ...validItem, count: -1 }] });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('error: exceeding 50-item limit returns 400', async () => {
      const items = Array.from({ length: 51 }, () => validItem);
      const res = await request(app).post('/api/v1/collateral/register/batch').send({ items });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });
  });
});
