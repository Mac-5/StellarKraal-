/**
 * Shared types for the typed API client fetch layer.
 *
 * These types describe request/response shapes, auth token access, and the
 * typed errors thrown by the client so they can be caught by error boundaries.
 */

/** HTTP methods supported by the API client. */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Query string parameters accepted by the client. */
export type QueryParams = Record<
  string,
  string | number | boolean | null | undefined
>;

/** Options accepted by a single API client request. */
export interface RequestOptions<TBody = unknown> {
  /** HTTP method. Defaults to GET. */
  method?: HttpMethod;
  /** Request body, serialized as JSON when present. */
  body?: TBody;
  /** Additional headers merged over the client defaults. */
  headers?: Record<string, string>;
  /** Query string parameters appended to the URL. */
  query?: QueryParams;
  /** AbortSignal for request cancellation. */
  signal?: AbortSignal;
  /**
   * Whether to attach the JWT auth token. Defaults to true. Set to false for
   * unauthenticated endpoints (e.g. login, token refresh).
   */
  authenticated?: boolean;
  /** Number of retry attempts for transient failures. Defaults to 0. */
  retries?: number;
}

/**
 * Provides the current JWT auth token and a way to refresh it. Implemented by
 * the React auth context and consumed by the API client.
 */
export interface AuthTokenProvider {
  /** Returns the current JWT token, or null when unauthenticated. */
  getToken: () => string | null;
  /**
   * Attempts to refresh the token. Resolves with the new token, or null when
   * refresh is not possible (e.g. refresh token expired).
   */
  refreshToken?: () => Promise<string | null>;
  /** Called when authentication can no longer be recovered (redirect to login). */
  onUnauthorized?: () => void;
}

/** Error codes emitted by the API client. */
export type ApiErrorCode =
  | 'NETWORK_ERROR'
  | 'HTTP_ERROR'
  | 'UNAUTHORIZED'
  | 'PARSE_ERROR'
  | 'ABORTED';

/** Base typed error thrown by the API client. */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status?: number;
  readonly url?: string;
  readonly details?: unknown;

  constructor(
    message: string,
    code: ApiErrorCode,
    options: { status?: number; url?: string; details?: unknown; cause?: unknown } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = options.status;
    this.url = options.url;
    this.details = options.details;
    if (options.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

/** Thrown for network failures (DNS, offline, connection reset, etc.). */
export class NetworkError extends ApiError {
  constructor(message: string, options: { url?: string; cause?: unknown } = {}) {
    super(message, 'NETWORK_ERROR', options);
    this.name = 'NetworkError';
  }
}

/** Thrown for non-2xx HTTP responses. */
export class HttpError extends ApiError {
  constructor(
    message: string,
    options: { status: number; url?: string; details?: unknown },
  ) {
    super(message, 'HTTP_ERROR', options);
    this.name = 'HttpError';
  }
}

/** Thrown when a request is unauthorized and cannot be recovered. */
export class UnauthorizedError extends ApiError {
  constructor(message: string, options: { url?: string; details?: unknown } = {}) {
    super(message, 'UNAUTHORIZED', { ...options, status: 401 });
    this.name = 'UnauthorizedError';
  }
}

/** Type guard for any API client error. */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
