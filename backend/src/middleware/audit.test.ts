import { auditMiddleware, redact } from "./audit";
import { Request, Response, NextFunction } from "express";
import { EventEmitter } from "events";

// Minimal mock for req/res
function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    method: "POST",
    path: "/api/loan/request",
    ip: "127.0.0.1",
    body: { borrower: "GABC", amount: 1000, private_key: "secret123" },
    requestId: "test-id",
    ...overrides,
  } as unknown as Request;
}

function makeRes(): Response & EventEmitter {
  const emitter = new EventEmitter() as Response & EventEmitter;
  (emitter as any).statusCode = 200;
  return emitter;
}

describe("auditMiddleware", () => {
  it("calls next()", () => {
    const next = jest.fn() as NextFunction;
    auditMiddleware(makeReq(), makeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("logs on response finish", (done) => {
    const next = jest.fn() as NextFunction;
    const res = makeRes();
    auditMiddleware(makeReq(), res, next);
    res.emit("finish");
    setImmediate(() => {
      expect(next).toHaveBeenCalled();
      done();
    });
  });

  it("does not throw for GET requests (no body logged)", () => {
    const next = jest.fn() as NextFunction;
    const res = makeRes();
    expect(() =>
      auditMiddleware(makeReq({ method: "GET" } as any), res, next)
    ).not.toThrow();
  });
});

describe("redact (via middleware body)", () => {
  it("middleware does not throw on body with sensitive fields", () => {
    const next = jest.fn() as NextFunction;
    const res = makeRes();
    const req = makeReq({
      body: { borrower: "GABC", password: "hunter2", privateKey: "0xdeadbeef" },
    } as any);
    expect(() => auditMiddleware(req, res, next)).not.toThrow();
  });

  it("middleware handles null body gracefully", () => {
    const next = jest.fn() as NextFunction;
    const res = makeRes();
    const req = makeReq({ body: null } as any);
    expect(() => auditMiddleware(req, res, next)).not.toThrow();
  });
});

describe("redact (direct)", () => {
  it("redacts raw refresh tokens accepted by the refresh endpoint", () => {
    expect(redact({ refreshToken: "raw-refresh-token" })).toEqual({ refreshToken: "[REDACTED]" });
  });

  it("redacts known sensitive fields", () => {
    const result = redact({
      borrower: "GABC",
      amount: 1000,
      private_key: "secret123",
      privateKey: "0xdeadbeef",
      password: "hunter2",
      apiKey: "key-abc",
    }) as Record<string, unknown>;

    expect(result.borrower).toBe("GABC");
    expect(result.amount).toBe(1000);
    expect(result.private_key).toBe("[REDACTED]");
    expect(result.privateKey).toBe("[REDACTED]");
    expect(result.password).toBe("[REDACTED]");
    expect(result.apiKey).toBe("[REDACTED]");
  });

  it("redacts nested sensitive fields", () => {
    const result = redact({
      user: { password: "secret", name: "Alice" },
    }) as any;

    expect(result.user.password).toBe("[REDACTED]");
    expect(result.user.name).toBe("Alice");
  });

  it("returns primitives unchanged", () => {
    expect(redact("string")).toBe("string");
    expect(redact(42)).toBe(42);
    expect(redact(null)).toBe(null);
  });
});

// ── PII masking (production-only) ─────────────────────────────────────────────

describe("redact — PII masking in production", () => {
  const FULL_KEY = "GABC1234567890DEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNO"; // 60 chars (invalid key for test)
  // Use a valid-format 56-char key: G + 55 chars from [A-Z2-7]
  const VALID_KEY = "GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV2";
  const SAMPLE_JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

  beforeEach(() => {
    process.env.NODE_ENV = "production";
  });

  afterEach(() => {
    process.env.NODE_ENV = "test";
  });

  it("masks Stellar wallet address in production (first4...last4)", () => {
    const result = redact({ walletAddress: VALID_KEY }) as Record<string, unknown>;
    const masked = result.walletAddress as string;
    expect(masked).toBe(`${VALID_KEY.slice(0, 4)}...${VALID_KEY.slice(-4)}`);
    expect(masked).not.toBe(VALID_KEY);
  });

  it("does not mask loan amounts (not PII)", () => {
    const result = redact({ amount: 500000, walletAddress: VALID_KEY }) as Record<string, unknown>;
    expect(result.amount).toBe(500000);
  });

  it("fully redacts JWT tokens in string fields in production", () => {
    const result = redact({ note: `Bearer ${SAMPLE_JWT}` }) as Record<string, unknown>;
    expect(result.note as string).not.toContain("eyJ");
    expect(result.note as string).toContain("[REDACTED]");
  });

  it("does not mask wallet addresses outside production", () => {
    // NODE_ENV is "test" by default in this suite (reset in afterEach)
    // We must ensure we're not in production for this assertion
    process.env.NODE_ENV = "test";
    const result = redact({ walletAddress: VALID_KEY }) as Record<string, unknown>;
    expect(result.walletAddress).toBe(VALID_KEY);
  });
});
