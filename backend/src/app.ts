import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import loanRoutes from './routes/loans';
import transactionRoutes from './routes/transactions';
import healthRoutes from './routes/health';

const app = express();

// Security and utility middleware
app.use(helmet());
app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

/**
 * Resolve the rate limit key for a request.
 * Authenticated requests are keyed by user id; unauthenticated by IP.
 */
const userOrIpKey = (req: Request): string => {
  const user = (req as Request & { user?: { id?: string } }).user;
  return user?.id ? `user:${user.id}` : `ip:${req.ip}`;
};

const rateLimitHandler = (
  _req: Request,
  res: Response,
  _next: NextFunction,
  options: { statusCode?: number; message?: string }
) => {
  res.status(options.statusCode ?? 429).json({
    error: options.message ?? 'Too many requests, please try again later.',
  });
};

// Global rate limit: broad protection across all endpoints
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  handler: (req, res, next) =>
    rateLimitHandler(req, res, next, {
      message: 'Too many requests, please try again later.',
    }),
});

// Auth endpoints: 10 requests per minute per IP (brute-force protection)
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => `ip:${req.ip}`,
  handler: (req, res, next) =>
    rateLimitHandler(req, res, next, {
      message: 'Too many authentication attempts, please try again later.',
    }),
});

// Write endpoints: 30 requests per minute per authenticated user
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  handler: (req, res, next) =>
    rateLimitHandler(req, res, next, {
      message: 'Too many write requests, please try again later.',
    }),
});

// Read endpoints: 120 requests per minute per authenticated user
const readLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  handler: (req, res, next) =>
    rateLimitHandler(req, res, next, {
      message: 'Too many read requests, please try again later.',
    }),
});

// Apply global limiter to every request
app.use(globalLimiter);

// Health checks are exempt from tiered limits
app.use('/api/health', healthRoutes);

// Auth tier: login and refresh
app.use('/api/auth', authLimiter, authRoutes);

// Read tier: GET requests on resource routes
app.get('/api/users', readLimiter);
app.get('/api/users/*', readLimiter);
app.get('/api/loans', readLimiter);
app.get('/api/loans/*', readLimiter);
app.get('/api/transactions', readLimiter);
app.get('/api/transactions/*', readLimiter);

// Write tier: mutating requests on resource routes
app.post('/api/users', writeLimiter);
app.put('/api/users/*', writeLimiter);
app.patch('/api/users/*', writeLimiter);
app.delete('/api/users/*', writeLimiter);
app.post('/api/loans', writeLimiter);
app.put('/api/loans/*', writeLimiter);
app.patch('/api/loans/*', writeLimiter);
app.delete('/api/loans/*', writeLimiter);
app.post('/api/transactions', writeLimiter);
app.put('/api/transactions/*', writeLimiter);
app.patch('/api/transactions/*', writeLimiter);
app.delete('/api/transactions/*', writeLimiter);

// Resource routes
app.use('/api/users', userRoutes);
app.use('/api/loans', loanRoutes);
app.use('/api/transactions', transactionRoutes);

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Centralized error handling
app.use(errorHandler);

logger.info('Express application initialized with tiered rate limiting');

export default app;
