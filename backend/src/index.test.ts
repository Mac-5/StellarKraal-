import request from "supertest";
import app from "./index";
import { insertCollateral, insertLoan, insertTransaction } from "./db/store";
import { checkDbHealth } from "./db/migrationRunner";

// Valid 56-char Stellar public key for use in tests
const VALID_ADDRESS = "GB4QO2DT7ASHWBIQS4DQ6O7M3UKNT2SWL7TBLZSC4S5FWBSL6VZ6TMEN";

// Mock auth middleware to bypass JWT in tests
jest.mock("./middleware/auth", () => {
  const express = jest.requireActual("express");
  const router = express.Router();
  return {
    authRouter: router,
    jwtMiddleware: (_req: any, _res: any, next: any) => next(),
  };
});

// Mock rpcClient to avoid real network calls
jest.mock("./utils/rpcClient", () => ({
  __esModule: true,
  default: {
    getAccount: jest.fn().mockResolvedValue({ id: "GABC", sequence: "1" }),
    prepareTransaction: jest.fn().mockResolvedValue({ toXDR: () => "prepared_xdr" }),
    simulateTransaction: jest.fn().mockResolvedValue({ result: { retval: { value: 42 } } }),
    getHealth: jest.fn().mockResolvedValue({ status: "healthy" }),
    getCircuitStates: jest.fn().mockReturnValue([]),
    isHealthy: jest.fn().mockReturnValue(true),
  },
}));

jest.mock("./utils/connectionPool", () => ({
  pool: {
    run: jest.fn().mockResolvedValue({ status: "healthy" }),
    stats: jest.fn().mockReturnValue({ size: 2, available: 2, inUse: 0, min: 2, max: 10 }),
    close: jest.fn(),
  },
  PoolExhaustedError: class PoolExhaustedError extends Error {},
}));

jest.mock("./db/migrationRunner", () => ({
  runMigrations: jest.fn().mockResolvedValue(undefined),
  checkDbHealth: jest.fn().mockResolvedValue(true),
  getMigrationStatus: jest.fn().mockResolvedValue("ok"),
}));

jest.mock("./utils/responseCache", () => ({
  responseCacheMiddleware: (_req: any, _res: any, next: any) => next(),
  createResponseCacheMiddleware: () => (_req: any, _res: any, next: any) => next(),
  invalidateCache: jest.fn(),
}));

// Mock the logger
jest.mock("./utils/logger", () => ({
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

// Mock uuid
jest.mock("uuid", () => ({
  v4: jest.fn(() => "test-request-id-12345"),
}));

// Mock stellar-sdk to avoid real network calls
jest.mock("@stellar/stellar-sdk", () => {
  const actual = jest.requireActual("@stellar/stellar-sdk");
  return {
    ...actual,
    Networks: {
      TESTNET: "Test SDF Network ; September 2015",
      PUBLIC: "Public Global Stellar Network ; September 2015",
    },
    BASE_FEE: "100",
    StrKey: actual.StrKey, // Use actual StrKey for validation
    Contract: jest.fn().mockImplementation(() => ({
      call: jest.fn().mockReturnValue({ type: "invokeHostFunction" }),
    })),
    TransactionBuilder: jest.fn().mockImplementation(() => ({
      addOperation: jest.fn().mockReturnThis(),
      setTimeout: jest.fn().mockReturnThis(),
      build: jest.fn().mockReturnValue({ toXDR: () => "mock_xdr_base64" }),
    })),
    Address: jest.fn().mockImplementation(() => ({
      toScVal: jest.fn().mockReturnValue({}),
    })),
    nativeToScVal: jest.fn().mockReturnValue({}),
    SorobanRpc: {
      Server: jest.fn().mockImplementation(() => ({
        getAccount: jest.fn().mockResolvedValue({ id: "GABC", sequence: "1" }),
        prepareTransaction: jest
          .fn()
          .mockResolvedValue({ toXDR: () => "prepared_xdr" }),
        simulateTransaction: jest
          .fn()
          .mockResolvedValue({ result: { retval: { value: 42 } } }),
        getHealth: jest.fn().mockResolvedValue({ status: "healthy" }),
      })),
    },
    rpc: {
      Server: jest.fn().mockImplementation(() => ({
        getAccount: jest.fn().mockResolvedValue({ id: "GABC", sequence: "1" }),
        prepareTransaction: jest
          .fn()
          .mockResolvedValue({ toXDR: () => "prepared_xdr" }),
        simulateTransaction: jest
          .fn()
          .mockResolvedValue({ result: { retval: { value: 42 } } }),
        getHealth: jest.fn().mockResolvedValue({ status: "healthy" }),
      })),
    },
  };
});

describe("StellarKraal API", () => {
  describe("GET /health database connectivity", () => {
    const mockCheckDbHealth = checkDbHealth as jest.MockedFunction<typeof checkDbHealth>;

    afterEach(() => {
      mockCheckDbHealth.mockResolvedValue(true);
    });

    it("returns 200 with database status and preserves uptime", async () => {
      mockCheckDbHealth.mockResolvedValue(true);
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: "ok", db: "ok" });
      expect(typeof res.body.uptime).toBe("number");
    });

    it("returns 503 when the database is unreachable", async () => {
      mockCheckDbHealth.mockResolvedValue(false);
      const res = await request(app).get("/health");
      expect(res.status).toBe(503);
      expect(res.body).toMatchObject({ status: "degraded", db: "error" });
      expect(typeof res.body.uptime).toBe("number");
    });

    it("returns the degraded response when the connectivity probe rejects", async () => {
      mockCheckDbHealth.mockRejectedValueOnce(new Error("connection refused"));
      const res = await request(app).get("/health");
      expect(res.status).toBe(503);
      expect(res.body).toMatchObject({ status: "degraded", db: "error" });
    });
  });

  describe("GET /api/health", () => {
    it("returns 200 with health status", async () => {
      const res = await request(app).get("/api/health");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("status");
      expect(res.body).toHaveProperty("version");
      expect(res.body).toHaveProperty("uptime");
      expect(res.body).toHaveProperty("rpcReachable");
    });

    it("includes correct health data structure", async () => {
      const res = await request(app).get("/api/health");
      expect(res.body.status).toBe("healthy");
      expect(typeof res.body.version).toBe("string");
      expect(typeof res.body.uptime).toBe("number");
      expect(typeof res.body.rpcReachable).toBe("boolean");
    });
  });

  describe("POST /api/collateral/register", () => {
    it("returns xdr for valid payload", async () => {
      const res = await request(app).post("/api/collateral/register").send({
        owner: VALID_ADDRESS,
        animal_type: "cattle",
        count: 5,
        appraised_value: 1000000,
      });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("xdr");
    });

    it("returns 400 for missing fields", async () => {
      const res = await request(app).post("/api/collateral/register").send({});
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error", "Validation failed");
    });

    it("returns 400 for invalid Stellar public key", async () => {
      const res = await request(app).post("/api/collateral/register").send({
        owner: "INVALID_KEY",
        animal_type: "cattle",
        count: 5,
        appraised_value: 1000000,
      });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error", "Validation failed");
      expect(res.body.details).toBeDefined();
      expect(Array.isArray(res.body.details)).toBe(true);
    });
  });

  describe("POST /api/loan/request", () => {
    it("returns xdr for valid payload", async () => {
      const res = await request(app).post("/api/loan/request").send({
        borrower: VALID_ADDRESS,
        collateral_id: 1,
        amount: 600000,
      });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("xdr");
    });

    it("returns 400 for invalid Stellar public key", async () => {
      const res = await request(app).post("/api/loan/request").send({
        borrower: "SAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN",
        collateral_id: 1,
        amount: 600000,
      });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error", "Validation failed");
    });
  });

  describe("POST /api/loan/repay", () => {
    it("returns xdr for valid payload with idempotency key", async () => {
      const res = await request(app)
        .post("/api/loan/repay")
        .set("Idempotency-Key", "test-key-001")
        .send({
          borrower: VALID_ADDRESS,
          loan_id: 1,
          amount: 200000,
        });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("xdr");
    });

    it("returns 400 when Idempotency-Key header is missing", async () => {
      const res = await request(app).post("/api/loan/repay").send({
        borrower: VALID_ADDRESS,
        loan_id: 1,
        amount: 200000,
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Idempotency-Key/);
    });

    it("returns cached response for duplicate idempotency key", async () => {
      const key = `idem-dup-${Date.now()}`;
      const payload = {
        borrower: VALID_ADDRESS,
        loan_id: 2,
        amount: 100000,
      };
      const first = await request(app)
        .post("/api/loan/repay")
        .set("Idempotency-Key", key)
        .send(payload);
      const second = await request(app)
        .post("/api/loan/repay")
        .set("Idempotency-Key", key)
        .send(payload);
      expect(second.status).toBe(first.status);
      expect(second.body).toEqual(first.body);
      expect(second.headers["x-idempotent-replayed"]).toBe("true");
    });

    it("returns 400 for invalid Stellar public key", async () => {
      const res = await request(app)
        .post("/api/loan/repay")
        .set("Idempotency-Key", "test-key-invalid")
        .send({
          borrower: "NOT_A_VALID_KEY",
          loan_id: 1,
          amount: 200000,
        });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error", "Validation failed");
    });
  });

  describe("GET /api/loans (pagination)", () => {
    it("returns paginated envelope with defaults", async () => {
      const res = await request(app).get("/api/loans");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("data");
      expect(res.body).toHaveProperty("total");
      expect(res.body).toHaveProperty("page", 1);
      expect(res.body).toHaveProperty("pageSize", 20);
    });

    it("respects ?page and ?pageSize params", async () => {
      const res = await request(app).get("/api/loans?page=2&pageSize=10");
      expect(res.status).toBe(200);
      expect(res.body.page).toBe(2);
      expect(res.body.pageSize).toBe(10);
    });

    it("returns 400 for invalid page param", async () => {
      const res = await request(app).get("/api/loans?page=0");
      expect(res.status).toBe(400);
    });

    it("returns 400 for pageSize > 100", async () => {
      const res = await request(app).get("/api/loans?pageSize=101");
      expect(res.status).toBe(400);
    });

    it("returns 400 for SQL-like page value", async () => {
      const res = await request(app).get("/api/loans?page=1;DROP TABLE loans");
      expect(res.status).toBe(400);
    });

    it("returns 400 for SQL-like pageSize value", async () => {
      const res = await request(app).get("/api/loans?pageSize=1;DROP TABLE loans");
      expect(res.status).toBe(400);
    });

    it("adds deprecation warning header when no pagination params", async () => {
      const res = await request(app).get("/api/loans");
      expect(res.headers["deprecation"]).toBe("true");
    });
  });

  describe("GET /api/transactions", () => {
    const maliciousBorrower = "GAAAAAAA; DROP TABLE transactions; --";
    const maliciousType = "loan; DROP TABLE transactions; --";
    const maliciousStatus = "completed; DROP TABLE transactions; --";
    const injectionDate = "2024-01-01; DROP TABLE transactions; --";

    beforeAll(() => {
      insertTransaction({
        borrower: VALID_ADDRESS,
        type: "loan",
        status: "pending",
        amount: 500000,
      });
    });

    it("returns empty result for SQL injection attempt in borrower filter", async () => {
      const res = await request(app)
        .get(`/api/transactions?borrower=${encodeURIComponent(maliciousBorrower)}&page=1&pageSize=20`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("data");
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toHaveLength(0);
      expect(res.body.total).toBe(0);
    });

    it("returns empty result for SQL injection attempt in type filter", async () => {
      const res = await request(app)
        .get(`/api/transactions?type=${encodeURIComponent(maliciousType)}&page=1&pageSize=20`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });

    it("returns empty result for SQL injection attempt in status filter", async () => {
      const res = await request(app)
        .get(`/api/transactions?status=${encodeURIComponent(maliciousStatus)}&page=1&pageSize=20`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });

    it("returns 400 for SQL injection attempt in startDate filter", async () => {
      const res = await request(app)
        .get(`/api/transactions?startDate=${encodeURIComponent(injectionDate)}&page=1&pageSize=20`);

      expect(res.status).toBe(400);
    });

    it("returns 400 for SQL injection attempt in endDate filter", async () => {
      const res = await request(app)
        .get(`/api/transactions?endDate=${encodeURIComponent(injectionDate)}&page=1&pageSize=20`);

      expect(res.status).toBe(400);
    });

    it("returns 400 for SQL-like page parameter", async () => {
      const res = await request(app).get("/api/transactions?page=1;DROP TABLE transactions");
      expect(res.status).toBe(400);
    });

    it("returns 400 for SQL-like pageSize parameter", async () => {
      const res = await request(app).get("/api/transactions?pageSize=1;DROP TABLE transactions");
      expect(res.status).toBe(400);
    });
  });

  describe("SQL injection protections in request bodies", () => {
    it("returns 400 for SQL injection attempt in loan request borrower", async () => {
      const res = await request(app).post("/api/loan/request").send({
        borrower: "SAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN; DROP TABLE loans; --",
        collateral_id: 1,
        amount: 600000,
      });

      expect(res.status).toBe(400);
    });

    it("returns 400 for SQL injection attempt in loan repay borrower", async () => {
      const res = await request(app)
        .post("/api/loan/repay")
        .set("Idempotency-Key", "sql-injection-test-01")
        .send({
          borrower: "NOT_A_VALID_KEY; DROP TABLE loans; --",
          loan_id: 1,
          amount: 200000,
        });

      expect(res.status).toBe(400);
    });

    it("returns 400 for SQL injection attempt in collateral register owner", async () => {
      const res = await request(app).post("/api/collateral/register").send({
        owner: "INVALID_KEY; DROP TABLE collateral; --",
        animal_type: "cattle",
        count: 5,
        appraised_value: 1000000,
      });

      expect(res.status).toBe(400);
    });

    it("returns 400 for SQL injection-like invalid webhook url", async () => {
      const res = await request(app).post("/api/webhooks").send({
        url: "javascript:alert('x');DROP TABLE webhooks; --",
      });

      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/loan/:id", () => {
    it("returns result for valid id", async () => {
      const res = await request(app).get("/api/loan/1");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("result");
    });
  });

  describe("GET /api/health/:loanId", () => {
    it("returns health_factor for valid id", async () => {
      const res = await request(app).get("/api/health/1");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("health_factor");
    });
  });

  describe("POST /api/loan/repayment-preview", () => {
    it("returns breakdown and projected health factor", async () => {
      const res = await request(app).post("/api/loan/repayment-preview").send({
        loan_id: 1,
        amount: 100,
      });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("loan_id", 1);
      expect(res.body).toHaveProperty("repayment_amount");
      expect(res.body).toHaveProperty("breakdown");
      expect(res.body.breakdown).toHaveProperty("principal");
      expect(res.body.breakdown).toHaveProperty("interest");
      expect(res.body.breakdown).toHaveProperty("fees");
      expect(res.body.breakdown).toHaveProperty("remaining_balance");
      expect(res.body).toHaveProperty("projected_health_factor_bps");
    });

    it("returns 400 for invalid payload", async () => {
      const res = await request(app).post("/api/loan/repayment-preview").send({
        loan_id: -1,
        amount: 0,
      });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error", "Validation failed");
    });
  });

  describe("Request ID middleware", () => {
    it("adds X-Request-ID header to response", async () => {
      const res = await request(app).get("/api/loan/1");
      expect(res.headers["x-request-id"]).toBeDefined();
      expect(res.headers["x-request-id"]).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });
  });

  describe("POST /api/loan/create", () => {
    let collateralId: string;

    beforeEach(() => {
      collateralId = `test-collateral-${Date.now()}-${Math.random()}`;
      insertCollateral({
        id: collateralId,
        owner: VALID_ADDRESS,
        animal_type: "cattle",
        count: 10,
        appraised_value: 1000000,
      });
    });

    it("returns 201 with loan and xdr for valid payload", async () => {
      const res = await request(app).post("/api/loan/create").send({
        borrowerAddress: VALID_ADDRESS,
        collateralId,
        requestedAmount: 500000,
      });
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("loan");
      expect(res.body).toHaveProperty("xdr");
      expect(res.body.loan.borrower).toBe(VALID_ADDRESS);
      expect(res.body.loan.collateral_id).toBe(collateralId);
      expect(res.body.loan.amount).toBe(500000);
    });

    it("caps loan amount at 80% of appraised_value", async () => {
      const res = await request(app).post("/api/loan/create").send({
        borrowerAddress: VALID_ADDRESS,
        collateralId,
        requestedAmount: 9999999,
      });
      expect(res.status).toBe(201);
      expect(res.body.loan.amount).toBe(800000); // 80% of 1_000_000
    });

    it("returns 400 for missing required fields", async () => {
      const res = await request(app).post("/api/loan/create").send({});
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error", "Validation failed");
    });

    it("returns 400 for invalid borrowerAddress", async () => {
      const res = await request(app).post("/api/loan/create").send({
        borrowerAddress: "INVALID",
        collateralId,
        requestedAmount: 100000,
      });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error", "Validation failed");
    });

    it("returns 400 for non-positive requestedAmount", async () => {
      const res = await request(app).post("/api/loan/create").send({
        borrowerAddress: VALID_ADDRESS,
        collateralId,
        requestedAmount: 0,
      });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error", "Validation failed");
    });

    it("returns 404 when collateral does not exist", async () => {
      const res = await request(app).post("/api/loan/create").send({
        borrowerAddress: VALID_ADDRESS,
        collateralId: "nonexistent-id",
        requestedAmount: 100000,
      });
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty("error", "Collateral not found");
    });

    it("returns 409 when collateral is already pledged", async () => {
      insertLoan({
        id: `existing-loan-${Date.now()}`,
        borrower: VALID_ADDRESS,
        collateral_id: collateralId,
        amount: 500000,
      });
      const res = await request(app).post("/api/loan/create").send({
        borrowerAddress: VALID_ADDRESS,
        collateralId,
        requestedAmount: 100000,
      });
      expect(res.status).toBe(409);
      expect(res.body).toHaveProperty("error", "Collateral is already pledged to another loan");
    });
  });

  describe("CORS middleware", () => {
    const FRONTEND = "http://localhost:3000";

    beforeEach(() => {
      delete process.env.FRONTEND_URL;
      process.env.NODE_ENV = "test";
    });

    afterEach(() => {
      delete process.env.FRONTEND_URL;
    });

    it("reflects allowed origin when FRONTEND_URL matches", async () => {
      process.env.FRONTEND_URL = FRONTEND;
      const res = await request(app)
        .get("/api/health")
        .set("Origin", FRONTEND);
      expect(res.headers["access-control-allow-origin"]).toBe(FRONTEND);
    });

    it("sets Access-Control-Max-Age: 86400 on preflight", async () => {
      process.env.FRONTEND_URL = FRONTEND;
      const res = await request(app)
        .options("/api/loan/request")
        .set("Origin", FRONTEND)
        .set("Access-Control-Request-Method", "POST");
      expect(res.headers["access-control-max-age"]).toBe("86400");
    });

    it("allows credentials on authenticated routes", async () => {
      process.env.FRONTEND_URL = FRONTEND;
      const res = await request(app)
        .options("/api/loan/request")
        .set("Origin", FRONTEND)
        .set("Access-Control-Request-Method", "POST");
      expect(res.headers["access-control-allow-credentials"]).toBe("true");
    });

    it("does not allow credentials on /api/health", async () => {
      process.env.FRONTEND_URL = FRONTEND;
      const res = await request(app)
        .get("/api/health")
        .set("Origin", FRONTEND);
      expect(res.headers["access-control-allow-credentials"]).toBeUndefined();
    });

    it("uses wildcard origin in development when FRONTEND_URL is unset", async () => {
      process.env.NODE_ENV = "development";
      const res = await request(app)
        .get("/api/health")
        .set("Origin", "http://any-origin.example");
      expect(res.headers["access-control-allow-origin"]).toBe("*");
    });
  });
});
