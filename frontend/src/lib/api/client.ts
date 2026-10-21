export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Skip attaching the JWT auth token (e.g. for public endpoints). */
  skipAuth?: boolean;
  /** Number of retry attempts for transient network/5xx failures. */
  retries?: number;
}

export type ApiErrorKind = 'network' | 'http' | 'unauthorized' | 'parse' | 'abort';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;
  readonly data?: unknown;

  constructor(kind: ApiErrorKind, message: string, status?: number, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    this.data = data;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

/**
 * Auth context contract. The React auth provider supplies these so the client
 * can attach the JWT and refresh it on 401 without importing React directly.
 */
export interface AuthContext {
  getToken: () => string | null | undefined;
  refreshToken?: () => Promise<string | null>;
  onUnauthorized?: () => void;
}

let authContext: AuthContext | null = null;

/** Register the auth context (called once by the auth provider). */
export function setAuthContext(context: AuthContext | null): void {
  authContext = context;
}

const DEFAULT_RETRIES = 2;
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

function resolveBaseUrl(): string {
  const env = typeof import.meta !== 'undefined' ? (import.meta as { env?: Record<string, string> }).env : undefined;
  return env?.VITE_API_BASE_URL ?? '';
}

function buildUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const base = resolveBaseUrl().replace(/\/$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      return await response.json();
    } catch {
      return undefined;
    }
  }
  try {
    return await response.text();
  } catch {
    return undefined;
  }
}

async function performRequest(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError('abort', 'Request was aborted');
    }
    const message = error instanceof Error ? error.message : 'Network request failed';
    throw new ApiError('network', message);
  }
}

async function handleUnauthorized<T>(url: string, init: RequestInit, retries: number): Promise<T> {
  if (authContext?.refreshToken) {
    const refreshed = await authContext.refreshToken();
    if (refreshed) {
      const headers = new Headers(init.headers);
      headers.set('Authorization', `Bearer ${refreshed}`);
      return request<T>(url, { ...init, headers }, retries);
    }
  }
  authContext?.onUnauthorized?.();
  throw new ApiError('unauthorized', 'Unauthorized', 401);
}

async function request<T>(url: string, init: RequestInit, retries: number): Promise<T> {
  const response = await performRequest(url, init);

  if (response.status === 401) {
    return handleUnauthorized<T>(url, init, retries);
  }

  if (!response.ok) {
    const data = await parseBody(response);
    if (RETRYABLE_STATUS.has(response.status) && retries > 0) {
      await delay(2 ** (DEFAULT_RETRIES - retries) * 250);
      return request<T>(url, init, retries - 1);
    }
    const message =
      (data && typeof data === 'object' && 'message' in data && typeof (data as { message: unknown }).message === 'string'
        ? (data as { message: string }).message
        : undefined) ?? `Request failed with status ${response.status}`;
    throw new ApiError('http', message, response.status, data);
  }

  return (await parseBody(response)) as T;
}

/**
 * Typed fetch wrapper. `TResponse` describes the parsed response shape and
 * `TBody` the request payload shape.
 */
export async function apiRequest<TResponse, TBody = unknown>(
  path: string,
  options: RequestOptions & { body?: TBody } = {},
): Promise<TResponse> {
  const { method = 'GET', body, headers: extraHeaders, signal, skipAuth, retries = DEFAULT_RETRIES } = options;

  const headers = new Headers(extraHeaders);
  if (body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (!skipAuth) {
    const token = authContext?.getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }

  const init: RequestInit = {
    method,
    headers,
    signal,
    body: body === undefined ? undefined : JSON.stringify(body),
  };

  return request<TResponse>(buildUrl(path), init, retries);
}

export const apiClient = {
  get: <TResponse>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<TResponse>(path, { ...options, method: 'GET' }),
  post: <TResponse, TBody = unknown>(path: string, body?: TBody, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<TResponse, TBody>(path, { ...options, method: 'POST', body }),
  put: <TResponse, TBody = unknown>(path: string, body?: TBody, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<TResponse, TBody>(path, { ...options, method: 'PUT', body }),
  patch: <TResponse, TBody = unknown>(path: string, body?: TBody, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<TResponse, TBody>(path, { ...options, method: 'PATCH', body }),
  delete: <TResponse>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<TResponse>(path, { ...options, method: 'DELETE' }),
};
