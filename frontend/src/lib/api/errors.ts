/**
 * Typed error hierarchy for the centralized API client.
 *
 * All errors thrown by the fetch layer extend {@link ApiError} so that
 * error boundaries and callers can reliably distinguish API failures
 * from unrelated runtime errors.
 */

export type ApiErrorKind =
  | "network"
  | "timeout"
  | "http"
  | "unauthorized"
  | "parse";

export interface ApiErrorInit {
  kind: ApiErrorKind;
  message: string;
  status?: number;
  code?: string;
  url?: string;
  method?: string;
  body?: unknown;
  cause?: unknown;
}

/** Base class for every error surfaced by the API client. */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;
  readonly code?: string;
  readonly url?: string;
  readonly method?: string;
  readonly body?: unknown;

  constructor(init: ApiErrorInit) {
    super(init.message);
    this.name = "ApiError";
    this.kind = init.kind;
    this.status = init.status;
    this.code = init.code;
    this.url = init.url;
    this.method = init.method;
    this.body = init.body;
    if (init.cause !== undefined) {
      (this as { cause?: unknown }).cause = init.cause;
    }
    // Restore prototype chain for instanceof checks after transpilation.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown when the request never produced an HTTP response. */
export class NetworkError extends ApiError {
  constructor(message: string, init: Omit<ApiErrorInit, "kind" | "message"> = {}) {
    super({ ...init, kind: "network", message });
    this.name = "NetworkError";
  }
}

/** Thrown when a request exceeds its configured timeout. */
export class TimeoutError extends ApiError {
  constructor(message: string, init: Omit<ApiErrorInit, "kind" | "message"> = {}) {
    super({ ...init, kind: "timeout", message });
    this.name = "TimeoutError";
  }
}

/** Thrown for any non-2xx HTTP response. */
export class HttpError extends ApiError {
  constructor(message: string, init: Omit<ApiErrorInit, "kind" | "message">) {
    super({ ...init, kind: "http", message });
    this.name = "HttpError";
  }
}

/** Thrown specifically for 401 responses after refresh/redirect handling. */
export class UnauthorizedError extends HttpError {
  constructor(message: string, init: Omit<ApiErrorInit, "kind" | "message">) {
    super(message, init);
    this.name = "UnauthorizedError";
    (this as { kind: ApiErrorKind }).kind = "unauthorized";
  }
}

/** Thrown when a response body cannot be parsed into the expected shape. */
export class ParseError extends ApiError {
  constructor(message: string, init: Omit<ApiErrorInit, "kind" | "message"> = {}) {
    super({ ...init, kind: "parse", message });
    this.name = "ParseError";
  }
}

/** Type guard usable inside error boundaries and catch blocks. */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function isUnauthorizedError(error: unknown): error is UnauthorizedError {
  return error instanceof UnauthorizedError;
}
