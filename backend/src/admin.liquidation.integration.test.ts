/**
 * Integration tests for POST /api/v1/admin/liquidation-check (issue #615).
 * Verifies admin-only access and correct invocation of the health factor job.
 */
import request from 'supertest';
import app from './index';

jest.mock('./utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
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
  Contract: jest.fn().mockImplementation(() => ({ call: jest.fn().mockReturnValue({}) })),
  TransactionBuilder: jest.fn().mockImplementation(() => ({
    addOperation: jest.fn().mockReturnThis(),
    setTimeout: jest.fn().mockReturnThis(),
    build: jest.fn().mockReturnValue({ toXDR: () => 'mock_xdr' }),
  })),
  Address: jest.fn().mockImplementation(() => ({ toScVal: jest.fn().mockReturnValue({}) })),
  nativeToScVal: jest.fn().mockReturnValue({}),
  scValToNative: jest.fn().mockReturnValue({}),
  xdr: { ScVal: { scvVoid: jest.fn().mockReturnValue({}) } },
  Keypair: {
    fromPublicKey: jest.fn().mockReturnValue({ verify: jest.fn().mockReturnValue(true) }),
  },
  SorobanRpc: {
    Server: jest.fn().mockImplementation(() => ({
      getAccount: jest.fn().mockResolvedValue({ id: 'GABC', sequence: '1' }),
      prepareTransaction: jest.fn().mockResolvedValue({ toXDR: () => 'prepared_xdr' }),
      simulateTransaction: jest.fn().mockResolvedValue({ result: { retval: {} } }),
      getHealth: jest.fn().mockResolvedValue({ status: 'healthy' }),
    })),
  },
}));

jest.mock('./jobs/healthFactorJob', () => ({
  scheduleHealthFactorJob: jest.fn(() => ({ stop: jest.fn() })),
  runHealthFactorJob: jest.fn().mockResolvedValue(3),
  evaluateHealthFactors: jest.fn().mockResolvedValue({ updated: 0, candidates: [] }),
}));

jest.mock('./jobs/repaymentReminderJob', () => ({
  scheduleRepaymentReminderJob: jest.fn(() => ({ stop: jest.fn() })),
}));

const ADMIN_KEY = 'GBGBE57DSWNBO73HMKLGPCNUR7V4T3WYCXU34AHVZAR3FFFOSVZLEABQ';
let testUser: any = { publicKey: ADMIN_KEY, role: 'admin' };

jest.mock('./middleware/auth', () => ({
  authRouter: require('express').Router(),
  jwtMiddleware: (req: any, _res: any, next: any) => {
    req.user = testUser;
    next();
  },
}));

describe('POST /api/v1/admin/liquidation-check', () => {
  beforeEach(() => {
    testUser = { publicKey: ADMIN_KEY, role: 'admin' };
    jest.clearAllMocks();
    const { runHealthFactorJob } = require('./jobs/healthFactorJob');
    (runHealthFactorJob as jest.Mock).mockResolvedValue(3);
  });

  it('returns 403 for non-admin user', async () => {
    testUser = { publicKey: ADMIN_KEY };
    const res = await request(app).post('/api/v1/admin/liquidation-check');
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/admin/);
  });

  it('returns 403 when role is not admin', async () => {
    testUser = { publicKey: ADMIN_KEY, role: 'user' };
    const res = await request(app).post('/api/v1/admin/liquidation-check');
    expect(res.status).toBe(403);
  });

  it('triggers job and returns updated count for admin', async () => {
    const { runHealthFactorJob } = require('./jobs/healthFactorJob');
    const res = await request(app).post('/api/v1/admin/liquidation-check');
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(3);
    expect(typeof res.body.triggeredAt).toBe('string');
    expect(runHealthFactorJob).toHaveBeenCalled();
  });

  it('returns a valid ISO timestamp in triggeredAt', async () => {
    const res = await request(app).post('/api/v1/admin/liquidation-check');
    expect(res.status).toBe(200);
    const ts = new Date(res.body.triggeredAt).getTime();
    // Timestamp must be a valid date within the last 5 seconds
    expect(Number.isFinite(ts)).toBe(true);
    expect(Date.now() - ts).toBeLessThan(5_000);
  });
});

describe('POST /api/v1/admin/liquidation/check', () => {
  beforeEach(() => {
    testUser = { publicKey: ADMIN_KEY, role: 'admin' };
    jest.clearAllMocks();
    const { evaluateHealthFactors } = require('./jobs/healthFactorJob');
    (evaluateHealthFactors as jest.Mock).mockResolvedValue({
      updated: 0,
      candidates: [{ id: 'loan-at-risk', health_factor: 9_500, status: 'at_risk' }],
    });
  });

  it('requires the admin role claim', async () => {
    testUser = { publicKey: ADMIN_KEY, role: 'user' };
    const res = await request(app).post('/api/v1/admin/liquidation/check');
    expect(res.status).toBe(403);
  });

  it('returns liquidation candidates and evaluates in read-only mode for dry runs', async () => {
    const { evaluateHealthFactors } = require('./jobs/healthFactorJob');
    const res = await request(app).post('/api/v1/admin/liquidation/check?dryRun=true');
    expect(res.status).toBe(200);
    expect(res.body.dryRun).toBe(true);
    expect(res.body.loans).toHaveLength(1);
    expect(evaluateHealthFactors).toHaveBeenCalledWith({ applyUpdates: false });
  });

  it('records an audit entry and applies evaluation updates by default', async () => {
    const { evaluateHealthFactors } = require('./jobs/healthFactorJob');
    const { listAuditEntries } = require('./db/store');
    const before = listAuditEntries({ action: 'liquidation.check' }).total;
    const res = await request(app).post('/api/v1/admin/liquidation/check');
    expect(res.status).toBe(200);
    expect(res.body.dryRun).toBe(false);
    expect(evaluateHealthFactors).toHaveBeenCalledWith({ applyUpdates: true });
    expect(listAuditEntries({ action: 'liquidation.check' }).total).toBe(before + 1);
  });
});
