/**
 * JWT authentication middleware and auth routes.
 *
 * Flow:
 *   1. GET  /api/auth/challenge  — returns a one-time challenge nonce
 *   2. POST /api/auth/login      — client submits { walletAddress, signedChallenge: { nonce, signature } }
 *                                  backend verifies Stellar ed25519 signature, issues JWT + refresh token
 *   3. POST /api/v1/auth/refresh — exchanges a body token or httpOnly cookie for a new JWT
 *                                  and a rotated refresh token; old token is invalidated in the DB
 *
 * Access tokens expire in ACCESS_TTL_MS (default 15 min).
 * Refresh tokens expire in REFRESH_TTL_MS (default 7 days) and are stored in the DB as SHA-256 hashes.
 * Revoked/rotated tokens are stored in a blocklist to prevent reuse attacks.
 * All POST/PUT/DELETE routes (except auth endpoints) require a valid JWT.
 */
import { Request, Response, NextFunction, Router } from 'express';
import { createHmac, randomBytes } from 'crypto';
import { Keypair } from '@stellar/stellar-sdk';
import { config } from '../config';
import { getProfile, updateProfile } from '../db/store';
import { insertRefreshToken, rotateRefreshToken, _clearRefreshTokens } from '../db/refreshTokens';
import { hashRefreshToken, revokeToken, isTokenBlocked } from '../utils/tokenBlocklist';
import { asyncHandler } from '../utils/asyncHandler';
import logger from '../utils/logger';

// ── Config ────────────────────────────────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET ?? 'change-me-in-production-min-32-chars!!';
/** Access token TTL in ms. Reads ACCESS_TTL_MS from config (default 15 min). */
const ACCESS_TTL_MS = parseInt(config.ACCESS_TTL_MS, 10);
/** Refresh token TTL in ms. Reads REFRESH_TTL_MS from config (default 7 days). */
const REFRESH_TTL_MS = parseInt(config.REFRESH_TTL_MS, 10);
const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const REFRESH_COOKIE = 'refreshToken';

// ── Minimal JWT (HS256, no external dep) ─────────────────────────────────────

function b64url(buf: Buffer | string): string {
  const s = typeof buf === 'string' ? Buffer.from(buf) : buf;
  return s.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function signJwt(payload: object): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest());
  return `${header}.${body}.${sig}`;
}

function verifyJwt(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed');
  const [header, body, sig] = parts;
  const expected = b64url(createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest());
  if (sig !== expected) throw new Error('invalid signature');
  const payload = JSON.parse(Buffer.from(body, 'base64').toString()) as Record<string, unknown>;
  if (typeof payload.exp === 'number' && Math.floor(Date.now() / 1000) > payload.exp) throw new Error('expired');
  return payload;
}

// ── In-memory stores ──────────────────────────────────────────────────────────

// challenge → expiry
const challenges = new Map<string, number>();

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Issue a new access token and rotate the refresh token.
 * Stores only the hash of the refresh token.
 * @param publicKey - Stellar wallet public key for the user.
 * @returns Access token string and raw refresh token (to be set as cookie).
 */
async function issueTokens(publicKey: string): Promise<{ accessToken: string; rawRefresh: string; expiresIn: number }> {
  const now = Date.now();
  const accessToken = signJwt({ sub: publicKey, iat: Math.floor(now / 1000), exp: Math.floor((now + ACCESS_TTL_MS) / 1000) });
  const rawRefresh = randomBytes(32).toString('hex');
  await insertRefreshToken(hashRefreshToken(rawRefresh), publicKey, now + REFRESH_TTL_MS);
  return { accessToken, rawRefresh, expiresIn: ACCESS_TTL_MS / 1000 };
}

/**
 * Set the refresh token as an httpOnly, Secure, SameSite=Strict cookie.
 * @param res - Express response object.
 * @param rawToken - Raw (unhashed) refresh token string.
 */
function setRefreshCookie(res: Response, rawToken: string): void {
  res.cookie(REFRESH_COOKIE, rawToken, {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: REFRESH_TTL_MS,
    path: '/api/v1/auth/refresh',
  });
}

// ── Router ────────────────────────────────────────────────────────────────────

export const authRouter = Router();

/**
 * @openapi
 * /auth/challenge:
 *   get:
 *     tags:
 *       - auth
 *     summary: Get a one-time challenge
 *     description: Returns a random hex challenge string. The client must sign it with their Stellar keypair and submit it to POST /auth/login.
 *     operationId: getChallenge
 *     security: []
 *     responses:
 *       '200':
 *         description: Challenge issued
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               description: Object containing the hex challenge string.
 *               properties:
 *                 challenge:
 *                   type: string
 *                   description: Random hex challenge string
 *                   example: a3f9...
 */
authRouter.get('/challenge', (_req: Request, res: Response) => {
  const challenge = randomBytes(32).toString('hex');
  challenges.set(challenge, Date.now() + CHALLENGE_TTL_MS);
  res.json({ challenge });
});

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags:
 *       - auth
 *     summary: Login with Stellar signature
 *     description: Verifies the ed25519 signature over the challenge. Returns a short-lived JWT access token (15 min) and a refresh token.
 *     operationId: login
 *     security: []
 *     requestBody:
 *       required: true
 *       description: Stellar public key, hex-encoded ed25519 signature, and the challenge string obtained from GET /auth/challenge.
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Login request payload.
 *             required:
 *               - walletAddress
 *               - signedChallenge
 *             properties:
 *               walletAddress:
 *                 type: string
 *                 description: Stellar G... public key
 *                 example: GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN
 *               signedChallenge:
 *                 type: object
 *                 description: Signed challenge nonce and ed25519 signature
 *                 required:
 *                   - nonce
 *                   - signature
 *                 properties:
 *                   nonce:
 *                     type: string
 *                     description: Nonce string obtained from challenge
 *                     example: a3f9...
 *                   signature:
 *                     type: string
 *                     description: Hex-encoded ed25519 signature
 *                     example: b4c8...
 *     responses:
 *       '200':
 *         description: JWT issued
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               description: Access token and expiry payload.
 *               properties:
 *                 accessToken:
 *                   type: string
 *                   description: JWT access token
 *                   example: eyJhbGci...
 *                 refreshToken:
 *                   type: string
 *                   description: Single-use refresh token, valid for 7 days by default
 *                 expiresIn:
 *                   type: integer
 *                   description: Access token validity period in seconds
 *                   example: 900
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 */
authRouter.post('/login', asyncHandler(async (req: Request, res: Response) => {
  const { walletAddress, signedChallenge } = req.body as {
    walletAddress?: string;
    signedChallenge?: { nonce?: string; signature?: string };
  };

  if (!walletAddress || !signedChallenge?.nonce || !signedChallenge?.signature) {
    return res.status(400).json({
      error: 'walletAddress and signedChallenge (with nonce and signature) are required',
    });
  }

  const { nonce, signature } = signedChallenge;

  // Validate nonce was issued by this server and hasn't expired
  const expiry = challenges.get(nonce);
  if (!expiry || Date.now() > expiry) {
    return res.status(401).json({ error: 'Invalid or expired challenge' });
  }
  challenges.delete(nonce); // one-time use

  // Verify Stellar ed25519 signature
  try {
    const kp = Keypair.fromPublicKey(walletAddress);
    const valid = kp.verify(Buffer.from(nonce, 'hex'), Buffer.from(signature, 'hex'));
    if (!valid) return res.status(401).json({ error: 'Signature verification failed' });
  } catch {
    return res.status(401).json({ error: 'Invalid wallet address or signature' });
  }

  // First login auto-creates the user's profile record.
  if (!getProfile(walletAddress)) {
    updateProfile(walletAddress, {});
  }

  const { accessToken, rawRefresh, expiresIn } = await issueTokens(walletAddress);
  setRefreshCookie(res, rawRefresh);
  res.json({ accessToken, refreshToken: rawRefresh, expiresIn });
}));

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     tags:
 *       - auth
 *     summary: Rotate refresh token
 *     description: Accepts a refreshToken in the JSON body or the existing httpOnly cookie. Atomically consumes the stored SHA-256 digest and issues a short-lived access token and a new refresh token (7 days by default). Reusing the old token returns 401.
 *     operationId: refreshToken
 *     security: []
 *     requestBody:
 *       required: false
 *       description: Refresh token; may instead be supplied via the refreshToken cookie.
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 description: Raw refresh token issued at login or by a previous rotation
 *     responses:
 *       '200':
 *         description: Token rotated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               description: New access token payload.
 *               properties:
 *                 accessToken:
 *                   type: string
 *                   description: JWT access token
 *                   example: eyJhbGci...
 *                 refreshToken:
 *                   type: string
 *                   description: Single-use refresh token, valid for 7 days by default
 *                 expiresIn:
 *                   type: integer
 *                   description: Access token validity in seconds
 *                   example: 900
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 */
authRouter.post('/refresh', asyncHandler(async (req: Request, res: Response) => {
  const cookieHeader = req.headers.cookie ?? '';
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${REFRESH_COOKIE}=([^;]+)`));
  const rawToken = req.body?.refreshToken ?? match?.[1];

  if (typeof rawToken !== 'string' || !rawToken.trim()) {
    return res.status(400).json({ error: 'MISSING_TOKEN', message: 'A refresh token is required in the body or cookie' });
  }

  const tokenHash = hashRefreshToken(rawToken);

  // Check if token is in blocklist (revoked/rotated)
  if (isTokenBlocked(tokenHash)) {
    logger.warn('Refresh token reuse attempt blocked', {
      tokenHash: tokenHash.slice(0, 8) + '...',
      ip: req.ip,
    });
    return res.status(401).json({ error: 'INVALID_TOKEN', message: 'Refresh token has been revoked' });
  }

  const rawRefresh = randomBytes(32).toString('hex');
  const now = Date.now();
  const publicKey = await rotateRefreshToken(tokenHash, hashRefreshToken(rawRefresh), now + REFRESH_TTL_MS);
  if (!publicKey) {
    return res.status(401).json({ error: 'INVALID_TOKEN', message: 'Refresh token is invalid or expired' });
  }

  // The database transaction is authoritative across processes and restarts.
  // Keep the existing blocklist as a fast local rejection of reuse attempts.
  revokeToken(tokenHash, 'rotated');
  const accessToken = signJwt({ sub: publicKey, iat: Math.floor(now / 1000), exp: Math.floor((now + ACCESS_TTL_MS) / 1000) });
  setRefreshCookie(res, rawRefresh);

  logger.info('Refresh token rotated successfully', {
    publicKey,
    oldTokenHash: tokenHash.slice(0, 8) + '...',
  });

  res.json({ accessToken, refreshToken: rawRefresh, expiresIn: ACCESS_TTL_MS / 1000 });
}));

// ── JWT middleware ────────────────────────────────────────────────────────────

// Protected GET routes (in addition to all mutating methods)
const PROTECTED_GET_PATTERNS = [
  /^\/api\/loans\/[^/]+$/,
  /^\/api\/collateral$/,
  /^\/api\/v1\/loans\/summary$/,
  /^\/api\/v1\/profile$/,
  /^\/api\/v1\/collateral\/[^/]+\/appraisals\/?$/,
];

/**
 * Protects all POST/PUT/DELETE/PATCH routes and specific GET routes.
 * Public routes: /api/auth/*, /api/health, GET /api/v1/health.
 * Attach as app-level middleware after auth router is mounted.
 * @param req - Incoming Express request.
 * @param res - Express response object.
 * @param next - Next middleware callback.
 * @returns void
 */
export function jwtMiddleware(req: Request, res: Response, next: NextFunction): void {
  const mutating = ['POST', 'PUT', 'DELETE', 'PATCH'];
  const isProtectedGet =
    req.method === 'GET' && PROTECTED_GET_PATTERNS.some((p) => p.test(req.path));

  if (!mutating.includes(req.method) && !isProtectedGet) return next();
  if (req.path.startsWith('/api/auth/')) return next();

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authorization header required' });
    return;
  }

  // API key path: Bearer sk_...
  if (authHeader.startsWith('Bearer sk_')) {
    // Lazy import to avoid circular deps; apiKey module is not loaded until first use
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { authenticateApiKey } = require('./apiKey') as { authenticateApiKey: (h: string) => string | null };
    const publicKey = authenticateApiKey(authHeader);
    if (!publicKey) {
      res.status(401).json({ error: 'Invalid or revoked API key' });
      return;
    }
    (req as Request & { user: { publicKey: string } }).user = { publicKey };
    next();
    return;
  }

  try {
    const payload = verifyJwt(authHeader.slice(7));
    (req as Request & { user: { publicKey: unknown; role?: string } }).user = {
      publicKey: payload.sub,
      role: typeof payload.role === 'string' ? payload.role : undefined,
    };
    next();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown';
    res.status(401).json({ error: message === 'expired' ? 'Token expired' : 'Invalid token' });
  }
}

/** Exported for testing only — clears the persistent refresh token store. */
export async function _resetRefreshTokens(): Promise<void> {
  await _clearRefreshTokens();
}
