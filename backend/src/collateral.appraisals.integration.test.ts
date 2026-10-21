/**
 * Integration tests for GET /api/v1/collateral/:id/appraisals
 * Covers shape, notes, authentication, owner/admin access and stable cursor pagination.
 */
import request from "supertest";
import app from "./index";
import { updateCollateral, softDeleteCollateral } from "./db/store";

jest.mock("./utils/logger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  createRequestLogger: jest.fn(() => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
  })),
}));

jest.mock("@stellar/stellar-sdk", () => {
  const isValidEd25519PublicKey = (v: string) =>
    typeof v === "string" && v.length === 56 && v.startsWith("G");
  return {
    StrKey: { isValidEd25519PublicKey },
    Networks: {
      TESTNET: "Test SDF Network ; September 2015",
      PUBLIC: "Public Global Stellar Network ; September 2015",
    },
    BASE_FEE: "100",
    Contract: jest.fn().mockImplementation(() => ({
      call: jest.fn().mockReturnValue({ type: "invokeHostFunction" }),
    })),
    TransactionBuilder: jest.fn().mockImplementation(() => ({
      addOperation: jest.fn().mockReturnThis(),
      setTimeout: jest.fn().mockReturnThis(),
      build: jest.fn().mockReturnValue({ toXDR: () => "mock_xdr" }),
    })),
    Address: jest.fn().mockImplementation(() => ({ toScVal: jest.fn().mockReturnValue({}) })),
    nativeToScVal: jest.fn().mockReturnValue({}),
    SorobanRpc: {
      Server: jest.fn().mockImplementation(() => ({
        getHealth: jest.fn().mockResolvedValue({ status: "healthy" }),
      })),
    },
    rpc: {
      Server: jest.fn().mockImplementation(() => ({
        getHealth: jest.fn().mockResolvedValue({ status: "healthy" }),
      })),
    },
  };
});

const VALID_OWNER = "GBGBE57DSWNBO73HMKLGPCNUR7V4T3WYCXU34AHVZAR3FFFOSVZLEABQ";
const OTHER_USER = "GASPH4OCYOERATXIKLPNURXUP7ISAQU2KWFB5XLUJ3LQHKHOCN3CEGD6";

let testUser: { publicKey: string; role?: string } | undefined = { publicKey: VALID_OWNER };

jest.mock("./middleware/auth", () => ({
  authRouter: require("express").Router(),
  jwtMiddleware: (req: any, _res: any, next: any) => {
    req.user = testUser;
    next();
  },
}));

async function createCollateral() {
  return request(app)
    .post("/api/v1/collateral")
    .send({ animal_type: "cattle", count: 3, appraised_value: 1_000_000 });
}

describe("GET /api/v1/collateral/:id/appraisals", () => {
  beforeEach(() => {
    testUser = { publicKey: VALID_OWNER };
  });

  it("returns the requested appraisal shape and final-page metadata", async () => {
    const { body: c } = await createCollateral();
    const res = await request(app).get(`/api/v1/collateral/${c.id}/appraisals`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([{ appraisedAt: expect.any(String), valueUSD: 1_000_000, appraiserNote: null }]);
    expect(res.body.nextCursor).toBeNull();
    expect(res.body.hasMore).toBe(false);
  });

  it("orders appraisals by appraisedAt descending", async () => {
    const { body: c } = await createCollateral();
    updateCollateral(c.id, { appraisal_history: [
      { date: "2026-01-03T00:00:00.000Z", value: 3 },
      { date: "2026-01-01T00:00:00.000Z", value: 1 },
      { date: "2026-01-02T00:00:00.000Z", value: 2 },
    ] });
    const res = await request(app).get(`/api/v1/collateral/${c.id}/appraisals`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((entry: any) => entry.valueUSD)).toEqual([3, 2, 1]);
  });

  it("preserves appraiser notes recorded through the appraisal route", async () => {
    const { body: c } = await createCollateral();
    await request(app)
      .put(`/api/v1/collateral/${c.id}/appraise`)
      .send({ appraised_value: 900_000, appraiserNote: "Healthy cattle" });
    const res = await request(app).get(`/api/v1/collateral/${c.id}/appraisals`);
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toEqual({ appraisedAt: expect.any(String), valueUSD: 900_000, appraiserNote: "Healthy cattle" });
  });

  it("returns an empty final page when no appraisals exist", async () => {
    const { body: c } = await createCollateral();
    updateCollateral(c.id, { appraisal_history: [] });
    const res = await request(app).get(`/api/v1/collateral/${c.id}/appraisals`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [], nextCursor: null, hasMore: false });
  });

  it("requires an authenticated caller", async () => {
    const { body: c } = await createCollateral();
    testUser = undefined;
    expect((await request(app).get(`/api/v1/collateral/${c.id}/appraisals`)).status).toBe(401);
  });

  it("returns 404 for unknown collateral id", async () => {
    const res = await request(app).get("/api/v1/collateral/nonexistent-id/appraisals");
    expect(res.status).toBe(404);
  });

  it("does not leak a previously fetched owner's history to another user", async () => {
    const { body: c } = await createCollateral();
    expect((await request(app).get(`/api/v1/collateral/${c.id}/appraisals`)).status).toBe(200);
    testUser = { publicKey: OTHER_USER };
    const res = await request(app).get(`/api/v1/collateral/${c.id}/appraisals`);
    expect(res.status).toBe(404);
  });

  it("returns 404 for deleted collateral", async () => {
    const { body: c } = await createCollateral();
    softDeleteCollateral(c.id);
    expect((await request(app).get(`/api/v1/collateral/${c.id}/appraisals`)).status).toBe(404);
  });

  it("allows admin to retrieve appraisals for any collateral", async () => {
    const { body: c } = await createCollateral();
    testUser = { publicKey: OTHER_USER, role: "admin" };
    const res = await request(app).get(`/api/v1/collateral/${c.id}/appraisals`);
    expect(res.status).toBe(200);
  });

  it("traverses timestamp ties without duplicates or omissions, including concurrent additions", async () => {
    const { body: c } = await createCollateral();
    const history = [1, 2, 3, 4].map((value) => ({ date: "2026-01-01T00:00:00.000Z", value }));
    updateCollateral(c.id, { appraisal_history: history });
    const first = await request(app).get(`/api/v1/collateral/${c.id}/appraisals?limit=2`);
    expect(first.body.data.map((entry: any) => entry.valueUSD)).toEqual([4, 3]);
    expect(first.body.hasMore).toBe(true);
    updateCollateral(c.id, { appraisal_history: [...history, { date: "2026-01-02T00:00:00.000Z", value: 5 }] });
    const second = await request(app).get(`/api/v1/collateral/${c.id}/appraisals`).query({ limit: 2, cursor: first.body.nextCursor });
    expect(second.status).toBe(200);
    expect(second.body.data.map((entry: any) => entry.valueUSD)).toEqual([2, 1]);
    expect(second.body.nextCursor).toBeNull();
    expect(second.body.hasMore).toBe(false);
  });

  it("defaults to 20 records and never returns more than 50 per page", async () => {
    const { body: c } = await createCollateral();
    updateCollateral(c.id, { appraisal_history: Array.from({ length: 55 }, (_, i) => ({ date: "2026-01-01T00:00:00.000Z", value: i + 1 })) });
    expect((await request(app).get(`/api/v1/collateral/${c.id}/appraisals`)).body.data).toHaveLength(20);
    const first = await request(app).get(`/api/v1/collateral/${c.id}/appraisals?limit=50`);
    expect(first.status).toBe(200);
    expect(first.body.data).toHaveLength(50);
    const second = await request(app).get(`/api/v1/collateral/${c.id}/appraisals`).query({ limit: 50, cursor: first.body.nextCursor });
    expect(second.body.data).toHaveLength(5);
    expect(second.body.hasMore).toBe(false);
  });

  it.each(["0", "-1", "51", "1.5", "abc"])("rejects invalid limit %s", async (limit) => {
    const { body: c } = await createCollateral();
    expect((await request(app).get(`/api/v1/collateral/${c.id}/appraisals`).query({ limit })).status).toBe(400);
  });

  it("rejects malformed cursors and cursors belonging to another collateral", async () => {
    const { body: c } = await createCollateral();
    expect((await request(app).get(`/api/v1/collateral/${c.id}/appraisals?cursor=not-a-cursor`)).status).toBe(400);
    updateCollateral(c.id, { appraisal_history: [1, 2].map((value) => ({ date: "2026-01-01T00:00:00.000Z", value })) });
    const first = await request(app).get(`/api/v1/collateral/${c.id}/appraisals?limit=1`);
    const { body: other } = await createCollateral();
    expect((await request(app).get(`/api/v1/collateral/${other.id}/appraisals`).query({ cursor: first.body.nextCursor })).status).toBe(400);
  });
});
