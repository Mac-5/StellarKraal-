import { createHmac } from "crypto";
import request from "supertest";
import { Keypair } from "@stellar/stellar-sdk";
import app from "../index";
import { jwtMiddleware, _resetRefreshTokens } from "./auth";
import { insertCollateral } from "../db/store";

jest.mock("../db/refreshTokens", () => {
  const tokens = new Map<string, { publicKey: string; expiresAt: number }>();
  return {
    insertRefreshToken: jest.fn(async (hash: string, publicKey: string, expiresAt: number) => {
      tokens.set(hash, { publicKey, expiresAt });
    }),
    rotateRefreshToken: jest.fn(async (oldHash: string, newHash: string, expiresAt: number) => {
      const token = tokens.get(oldHash);
      if (!token || token.expiresAt <= Date.now()) return undefined;
      tokens.delete(oldHash);
      tokens.set(newHash, { publicKey: token.publicKey, expiresAt });
      return token.publicKey;
    }),
    _clearRefreshTokens: jest.fn(async () => { tokens.clear(); }),
  };
});

jest.mock("../utils/logger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  createRequestLogger: jest.fn(() => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
  })),
}));

// Avoid jest.requireActual("@stellar/stellar-sdk") — some transitive deps use
// ESM import statements that ts-jest cannot transform. Define a self-contained
// mock with a crypto-based Keypair stand-in instead.
jest.mock("@stellar/stellar-sdk", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createHmac: hmac } = require("crypto") as typeof import("crypto");
  // Registry: publicKey → seed, so fromPublicKey can verify signatures produced by random()
  const registry = new Map<string, Buffer>();
  class KP {
    constructor(private pub: string, private seed: Buffer) {}
    static random() {
      const seed = Buffer.from(String(Math.random()));
      const pub = "GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV2";
      registry.set(pub, seed);
      return new KP(pub, seed);
    }
    static fromPublicKey(pub: string) {
      const seed = registry.get(pub) ?? Buffer.alloc(32, pub);
      return new KP(pub, seed);
    }
    publicKey() { return this.pub; }
    sign(data: Buffer) { return hmac("sha512", this.seed).update(data).digest(); }
    verify(data: Buffer, sig: Buffer) { return hmac("sha512", this.seed).update(data).digest().equals(sig); }
  }
  return {
    Keypair: KP,
    StrKey: { isValidEd25519PublicKey: () => true },
    Networks: { TESTNET: "Test SDF Network ; September 2015", PUBLIC: "Public Global Stellar Network ; September 2015" },
    BASE_FEE: "100",
    Contract: jest.fn(() => ({ call: jest.fn().mockReturnValue({}) })),
    TransactionBuilder: jest.fn(() => ({
      addOperation: jest.fn().mockReturnThis(),
      setTimeout: jest.fn().mockReturnThis(),
      build: jest.fn().mockReturnValue({ toXDR: () => "mock_xdr" }),
    })),
    Address: jest.fn(() => ({ toScVal: jest.fn().mockReturnValue({}) })),
    nativeToScVal: jest.fn().mockReturnValue({}),
    SorobanRpc: {
      Server: jest.fn(() => ({
        getAccount: jest.fn().mockResolvedValue({ id: "GABC", sequence: "1" }),
        prepareTransaction: jest.fn().mockResolvedValue({ toXDR: () => "prepared_xdr" }),
        simulateTransaction: jest.fn().mockResolvedValue({ result: { retval: {} } }),
        getHealth: jest.fn().mockResolvedValue({ status: "healthy" }),
      })),
    },
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getChallenge(): Promise<string> {
  const res = await request(app).get("/api/auth/challenge");
  expect(res.status).toBe(200);
  return res.body.challenge as string;
}

async function login(kp: any): Promise<{ accessToken: string; expiresIn: number; refreshCookie: string }> {
  const challenge = await getChallenge();
  const res = await request(app).post("/api/auth/login").send({
    walletAddress: kp.publicKey(),
    signedChallenge: { nonce: challenge, signature: kp.sign(Buffer.from(challenge, "hex")).toString("hex") },
  });
  expect(res.status).toBe(200);
  const cookieHeader: string = (res.headers["set-cookie"] as unknown as string[])?.[0] ?? "";
  return { ...res.body, refreshCookie: cookieHeader };
}

const JWT_SECRET = "change-me-in-production-min-32-chars!!";
function b64url(buf: Buffer | string): string {
  const s = typeof buf === "string" ? Buffer.from(buf) : buf;
  return s.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
function makeToken(payload: object, secret = JWT_SECRET): string {
  const h = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const b = b64url(JSON.stringify(payload));
  return `${h}.${b}.${b64url(createHmac("sha256", secret).update(`${h}.${b}`).digest())}`;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("JWT Authentication", () => {
  const kp = (Keypair as any).random();

  beforeEach(async () => { await _resetRefreshTokens(); });

  app.post("/__test/user", jwtMiddleware, (req, res) => {
    res.json({ user: (req as any).user ?? null });
  });

  describe("GET /api/auth/challenge", () => {
    it("returns a 64-char hex challenge", async () => {
      const res = await request(app).get("/api/auth/challenge");
      expect(res.status).toBe(200);
      expect(res.body.challenge).toMatch(/^[0-9a-f]{64}$/);
    });

    it("each call returns a unique challenge", async () => {
      expect(await getChallenge()).not.toBe(await getChallenge());
    });
  });

  describe("POST /api/auth/login", () => {
    it("returns accessToken and sets httpOnly refreshToken cookie", async () => {
      const { accessToken, refreshCookie } = await login(kp);
      expect(typeof accessToken).toBe("string");
      expect(refreshCookie).toContain("refreshToken=");
      expect(refreshCookie).toContain("HttpOnly");
    });

    it("expiresIn is 900 (15 min)", async () => {
      expect((await login(kp)).expiresIn).toBe(900);
    });

    it("rejects missing fields with 400", async () => {
      expect((await request(app).post("/api/auth/login").send({})).status).toBe(400);
    });

    it("challenge is single-use", async () => {
      const challenge = await getChallenge();
      const body = {
        walletAddress: kp.publicKey(),
        signedChallenge: { nonce: challenge, signature: kp.sign(Buffer.from(challenge, "hex")).toString("hex") },
      };
      expect((await request(app).post("/api/auth/login").send(body)).status).toBe(200);
      expect((await request(app).post("/api/auth/login").send(body)).status).toBe(401);
    });
  });

  describe("POST /api/v1/auth/refresh", () => {
    it("accepts a body token without an access token and returns a rotated pair", async () => {
      const { refreshCookie } = await login(kp);
      const oldToken = refreshCookie.split(";")[0].split("=")[1];
      const res = await request(app).post("/api/v1/auth/refresh").send({ refreshToken: oldToken });
      expect(res.status).toBe(200);
      expect(res.body.refreshToken).toMatch(/^[0-9a-f]{64}$/);
      expect(res.body.refreshToken).not.toBe(oldToken);
      expect(res.body.expiresIn).toBe(900);
      const payload = JSON.parse(Buffer.from(res.body.accessToken.split(".")[1], "base64url").toString());
      expect(payload.sub).toBe(kp.publicKey());
      expect(payload.exp - payload.iat).toBe(900);
      expect((res.headers["set-cookie"] as unknown as string[])[0]).toContain("Max-Age=604800");
      expect((await request(app).post("/api/v1/auth/refresh").send({ refreshToken: oldToken })).status).toBe(401);
      expect((await request(app).post("/api/v1/auth/refresh").send({ refreshToken: res.body.refreshToken })).status).toBe(200);
    });

    it("rejects missing and non-string body tokens", async () => {
      expect((await request(app).post("/api/v1/auth/refresh").send({})).status).toBe(400);
      expect((await request(app).post("/api/v1/auth/refresh").send({ refreshToken: 42 })).status).toBe(400);
    });

    it("returns new accessToken and rotated refresh cookie", async () => {
      const { refreshCookie } = await login(kp);
      const res = await request(app).post("/api/auth/refresh").set("Cookie", refreshCookie.split(";")[0]);
      expect(res.status).toBe(200);
      expect(typeof res.body.accessToken).toBe("string");
      expect((res.headers["set-cookie"] as unknown as string[])?.[0]).toContain("refreshToken=");
    });

    it("old token rejected after rotation (revocation)", async () => {
      const { refreshCookie } = await login(kp);
      const cv = refreshCookie.split(";")[0];
      await request(app).post("/api/auth/refresh").set("Cookie", cv);
      const res = await request(app).post("/api/auth/refresh").set("Cookie", cv);
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("INVALID_TOKEN");
    });

    it("missing cookie returns 400", async () => {
      const res = await request(app).post("/api/auth/refresh");
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("MISSING_TOKEN");
    });

    it("invalid token returns 401", async () => {
      const res = await request(app).post("/api/auth/refresh").set("Cookie", "refreshToken=bogus");
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("INVALID_TOKEN");
    });

    it("returns message 'Refresh token has been revoked' on blocklisted token", async () => {
      const { refreshCookie } = await login(kp);
      const cv = refreshCookie.split(";")[0];
      
      // First rotation succeeds
      const firstRotation = await request(app).post("/api/auth/refresh").set("Cookie", cv);
      expect(firstRotation.status).toBe(200);
      
      // Second attempt with same old token should be blocked with revocation message
      const secondAttempt = await request(app).post("/api/auth/refresh").set("Cookie", cv);
      expect(secondAttempt.status).toBe(401);
      expect(secondAttempt.body.message).toContain("revoked");
    });

    it("issued tokens are independent after rotation", async () => {
      const { refreshCookie: cookie1 } = await login(kp);
      const cv1 = cookie1.split(";")[0];
      
      // First rotation
      const res1 = await request(app).post("/api/auth/refresh").set("Cookie", cv1);
      const cookie2 = (res1.headers["set-cookie"] as unknown as string[])?.[0];
      const cv2 = cookie2.split(";")[0];
      
      // Second rotation with new token succeeds
      const res2 = await request(app).post("/api/auth/refresh").set("Cookie", cv2);
      expect(res2.status).toBe(200);
      
      // Old token should still be rejected
      const res3 = await request(app).post("/api/auth/refresh").set("Cookie", cv1);
      expect(res3.status).toBe(401);
    });
  });

  describe("authenticated appraisal history", () => {
    it("requires a JWT and respects signed owner/admin claims", async () => {
      const collateral = insertCollateral({ id: "jwt-appraisal-history", owner: kp.publicKey(), animal_type: "cattle", count: 1, appraised_value: 100 });
      const url = `/api/v1/collateral/${collateral.id}/appraisals`;
      expect((await request(app).get(url)).status).toBe(401);
      const exp = Math.floor(Date.now() / 1000) + 900;
      expect((await request(app).get(url).set("Authorization", `Bearer ${makeToken({ sub: kp.publicKey(), exp })}`)).status).toBe(200);
      expect((await request(app).get(url).set("Authorization", `Bearer ${makeToken({ sub: "other-wallet", exp })}`)).status).toBe(404);
      expect((await request(app).get(url).set("Authorization", `Bearer ${makeToken({ sub: "admin-wallet", role: "admin", exp })}`)).status).toBe(200);
    });
  });

  describe("JWT middleware", () => {
    it("POST without token → 401", async () => {
      expect((await request(app).post("/api/collateral/register").send({})).status).toBe(401);
    });

    it("POST with valid token → succeeds", async () => {
      const { accessToken } = await login(kp);
      const res = await request(app)
        .post("/api/collateral/register")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ owner: kp.publicKey(), animal_type: "cattle", count: 5, appraised_value: 1_000_000 });
      expect(res.status).toBe(200);
    });

    it("tampered token → 401", async () => {
      const { accessToken } = await login(kp);
      expect(
        (await request(app).post("/api/collateral/register").set("Authorization", `Bearer ${accessToken.slice(0, -4)}xxxx`).send({})).status
      ).toBe(401);
    });

    it("GET /api/health is public", async () => {
      expect((await request(app).get("/api/health")).status).toBe(200);
    });

    it("sets req.user from valid token", async () => {
      const { accessToken } = await login(kp);
      const res = await request(app).post("/__test/user").set("Authorization", `Bearer ${accessToken}`).send({});
      expect(res.body.user).toEqual({ publicKey: kp.publicKey() });
    });

    it("expired token → 401 Token expired", async () => {
      const token = makeToken({ sub: kp.publicKey(), exp: Math.floor(Date.now() / 1000) - 10, iat: 0 });
      const res = await request(app).post("/api/collateral/register").set("Authorization", `Bearer ${token}`).send({});
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Token expired");
    });

    it("malformed token → 401", async () => {
      const res = await request(app).post("/api/collateral/register").set("Authorization", "Bearer not.valid.jwt").send({});
      expect(res.status).toBe(401);
    });

    it("wrong-secret token → 401", async () => {
      const token = makeToken({ sub: kp.publicKey(), exp: Math.floor(Date.now() / 1000) + 100, iat: 0 }, "wrong");
      const res = await request(app).post("/api/collateral/register").set("Authorization", `Bearer ${token}`).send({});
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Invalid token");
    });
  });
});
