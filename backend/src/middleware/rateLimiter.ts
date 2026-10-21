import { Request, Response, NextFunction } from 'express';
import rateLimit, { RateLimitRequestHandler } from 'express-rate-limit';

/**
 * Tiered rate limiting for API endpoints.
 *
 * Tiers:
 *  - auth:  10 requests / minute per IP (login, refresh)
 *  - write: 30 requests / minute per authenticated user
 *  - read:  120 requests / minute per authenticated user
 *
 * All limiters emit X-RateLimit-Limit, X-RateLimit-Remaining and Retry-After
 * headers on every response.
 */

const WINDOW_MS = 60 * 1000;

function userOrIpKey(req: Request): string {
  const user = (req as Request & { user?: { id?: string | number } }).user;
  if (user && user.id !== undefined && user.id !== null) {
    return `user:${user.id}`;
  }
  return `ip:${req.ip}`;
}

function ipKey(req: Request): string {
  return `ip:${req.ip}`;
}

function buildLimiter(max: number, keyGenerator: (req: Request) => string): RateLimitRequestHandler {
  return rateLimit({
    windowMs: WINDOW_MS,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator,
    handler: (req: Request, res: Response) => {
      const resetTime = (req as Request & { rateLimit?: { resetTime?: Date } }).rateLimit?.resetTime;
      const retryAfter = resetTime
        ? Math.max(0, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
        : Math.ceil(WINDOW_MS / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({
        error: 'Too many requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter,
      });
    },
  });
}

/** Auth endpoints (login, refresh): 10 req/min per IP. */
export const authRateLimiter = buildLimiter(10, ipKey);

/** Write endpoints: 30 req/min per authenticated user. */
export const writeRateLimiter = buildLimiter(30, userOrIpKey);

/** Read endpoints: 120 req/min per authenticated user. */
export const readRateLimiter = buildLimiter(120, userOrIpKey);

/**
 * Ensures Retry-After is present on successful responses as well, so the
 * header contract holds on all responses (not only 429s).
 */
export function rateLimitHeaders(limiter: RateLimitRequestHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    limiter(req, res, (err?: unknown) => {
      if (err) {
        return next(err);
      }
      const info = (req as Request & { rateLimit?: { limit?: number; remaining?: number; resetTime?: Date } }).rateLimit;
      if (info) {
        if (info.limit !== undefined) {
          res.setHeader('X-RateLimit-Limit', String(info.limit));
        }
        if (info.remaining !== undefined) {
          res.setHeader('X-RateLimit-Remaining', String(info.remaining));
        }
        if (info.resetTime) {
          const retryAfter = Math.max(0, Math.ceil((info.resetTime.getTime() - Date.now()) / 1000));
          res.setHeader('Retry-After', String(retryAfter));
        }
      }
      next();
    });
  };
}

export default {
  authRateLimiter,
  writeRateLimiter,
  readRateLimiter,
  rateLimitHeaders,
};
