import { Request, Response, NextFunction } from "express";
import logger from "../utils/logger";

import { ErrorCode, getStatusCode } from "../utils/errorCodes";

/**
 * Application-level error class with HTTP status code and error code.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(
    statusCodeOrCode: number | ErrorCode | string,
    message: string,
    codeOrDetails?: string | unknown
  ) {
    super(message);
    this.name = "AppError";

    if (typeof statusCodeOrCode === "number") {
      this.statusCode = statusCodeOrCode;
      this.code = typeof codeOrDetails === "string" ? codeOrDetails : "INTERNAL_ERROR";
      this.details = typeof codeOrDetails === "object" ? codeOrDetails : undefined;
    } else {
      this.code = statusCodeOrCode;
      this.statusCode = getStatusCode(statusCodeOrCode as ErrorCode);
      this.details = codeOrDetails;
    }
  }
}

/**
 * Known Soroban contract error codes mapped to application error codes.
 * Soroban contract errors are surfaced as numeric codes (e.g. from
 * `InvokeHostFunction` results) or as symbolic names in RPC error strings.
 */
export const SOROBAN_ERROR_MAP: Record<string, { code: string; message: string }> = {
  // Contract-level failures
  "1": { code: "CONTRACT_INVALID_ARGUMENT", message: "Contract rejected the provided arguments" },
  "2": { code: "CONTRACT_UNAUTHORIZED", message: "Contract call was not authorized" },
  "3": { code: "CONTRACT_INSUFFICIENT_BALANCE", message: "Contract reported insufficient balance" },
  "4": { code: "CONTRACT_NOT_FOUND", message: "Contract or referenced entry was not found" },
  "5": { code: "CONTRACT_STATE_ERROR", message: "Contract encountered an invalid state" },
  // Symbolic Soroban host error names
  InvalidAction: { code: "CONTRACT_INVALID_ARGUMENT", message: "Contract rejected the provided arguments" },
  Unauthorized: { code: "CONTRACT_UNAUTHORIZED", message: "Contract call was not authorized" },
  InsufficientBalance: { code: "CONTRACT_INSUFFICIENT_BALANCE", message: "Contract reported insufficient balance" },
  MissingValue: { code: "CONTRACT_NOT_FOUND", message: "Contract or referenced entry was not found" },
  ExistingValue: { code: "CONTRACT_STATE_ERROR", message: "Contract encountered an invalid state" },
};

/**
 * Extracts a Soroban error code from an arbitrary RPC/contract error.
 */
function extractSorobanCode(err: unknown): string | undefined {
  if (err && typeof err === "object") {
    const anyErr = err as Record<string, unknown>;
    if (typeof anyErr.code === "string" || typeof anyErr.code === "number") {
      return String(anyErr.code);
    }
    if (typeof anyErr.contractCode === "string" || typeof anyErr.contractCode === "number") {
      return String(anyErr.contractCode);
    }
  }
  if (typeof err === "string") {
    const match = err.match(/\b(InvalidAction|Unauthorized|InsufficientBalance|MissingValue|ExistingValue)\b/);
    if (match) return match[1];
    const numMatch = err.match(/\bcode[:\s]+(\d+)\b/i);
    if (numMatch) return numMatch[1];
  }
  return undefined;
}

/**
 * Translates known Soroban contract errors to structured AppErrors.
 * Unknown contract errors are logged with full RPC context and returned
 * as a 502 Bad Gateway to the client.
 */
export class ContractErrorMapper {
  /**
   * Maps a Soroban contract/RPC error to an AppError.
   * @param err - The raw error thrown by the Soroban RPC client.
   * @param context - Additional RPC context for logging (method, params, etc.).
   */
  static map(err: unknown, context: Record<string, unknown> = {}): AppError {
    const sorobanCode = extractSorobanCode(err);
    const mapped = sorobanCode ? SOROBAN_ERROR_MAP[sorobanCode] : undefined;

    if (mapped) {
      return new AppError(502, mapped.message, mapped.code);
    }

    const message = err instanceof Error ? err.message : String(err);
    logger.error("Unknown Soroban contract error", {
      error: message,
      sorobanCode,
      rpcContext: context,
    });

    return new AppError(502, "Soroban contract call failed", "CONTRACT_CALL_FAILED");
  }
}

/**
 * Express error handler middleware. Formats and logs all unhandled errors.
 * @param err - The caught error.
 * @param req - Express request object.
 * @param res - Express response object.
 * @param _next - Unused next function (required for Express error handler signature).
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  const correlationId = (req as any).requestId ?? "unknown";
  const reqLogger = (req as any).logger ?? logger;

  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const code = err instanceof AppError ? err.code : "INTERNAL_ERROR";

  reqLogger.error("Unhandled error", {
    error: err.message,
    stack: err.stack,
    code,
    correlationId,
    method: req.method,
    path: req.path,
  });

  const responseBody: Record<string, unknown> = {
    error: err.message,
    code,
    correlationId,
  };

  if (err instanceof AppError && err.details !== undefined) {
    responseBody.details = err.details;
  }

  if (process.env.NODE_ENV === "development" && err.stack) {
    responseBody.stack = err.stack;
  }

  res.status(statusCode).json(responseBody);
}
