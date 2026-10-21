import { randomUUID } from "crypto";
import { Request, Response, NextFunction } from "express";

// Extend Express Request to carry a requestId field.
declare module "express-serve-static-core" {
  interface Request {
    requestId?: string;
  }
}

/**
 * Middleware to attach a unique request ID to each incoming request.
 * Honours the X-Request-ID header if present, otherwise generates a new UUID.
 * Sets the X-Request-ID response header for tracing.
 * @param req - Express request object.
 * @param res - Express response object.
 * @param next - Express next function.
 */
export const requestIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const incoming = req.headers["x-request-id"];
  const headerValue = Array.isArray(incoming) ? incoming[0] : incoming;
  req.requestId =
    typeof headerValue === "string" && headerValue.trim().length > 0
      ? headerValue.trim()
      : randomUUID();
  res.setHeader("X-Request-ID", req.requestId);
  next();
};
