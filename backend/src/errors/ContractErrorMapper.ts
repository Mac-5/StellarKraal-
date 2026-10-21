/**
 * Maps Soroban contract invocation failures to structured application errors.
 *
 * Known Soroban error codes are translated to application error codes so the
 * client receives a stable, meaningful response. Unknown contract errors are
 * logged with the full RPC context and surfaced as a 502 Bad Gateway.
 */

export interface RpcContext {
  contractId?: string;
  method?: string;
  network?: string;
  rpcUrl?: string;
  attempt?: number;
  rawError?: unknown;
}

export interface MappedContractError {
  statusCode: number;
  code: string;
  message: string;
  retryable: boolean;
}

/**
 * Known Soroban contract error codes and their application equivalents.
 * Keys are the numeric contract error codes returned by the Soroban host.
 */
export const SOROBAN_ERROR_MAP: Record<number, MappedContractError> = {
  1: {
    statusCode: 400,
    code: 'CONTRACT_INVALID_ARGUMENT',
    message: 'Contract invocation received an invalid argument',
    retryable: false,
  },
  2: {
    statusCode: 400,
    code: 'CONTRACT_INSUFFICIENT_BALANCE',
    message: 'Insufficient balance for contract operation',
    retryable: false,
  },
  3: {
    statusCode: 403,
    code: 'CONTRACT_UNAUTHORIZED',
    message: 'Contract operation is not authorized',
    retryable: false,
  },
  4: {
    statusCode: 404,
    code: 'CONTRACT_NOT_FOUND',
    message: 'Requested contract resource was not found',
    retryable: false,
  },
  5: {
    statusCode: 409,
    code: 'CONTRACT_STATE_CONFLICT',
    message: 'Contract state conflict prevented the operation',
    retryable: false,
  },
  6: {
    statusCode: 429,
    code: 'CONTRACT_RATE_LIMITED',
    message: 'Contract operation was rate limited',
    retryable: true,
  },
};

const UNKNOWN_CONTRACT_ERROR: MappedContractError = {
  statusCode: 502,
  code: 'CONTRACT_UNKNOWN_ERROR',
  message: 'Contract invocation failed',
  retryable: false,
};

/**
 * Extracts a numeric Soroban contract error code from a raw RPC error.
 * Soroban surfaces codes in several shapes depending on the RPC client, so we
 * probe the common locations before giving up.
 */
export function extractContractErrorCode(rawError: unknown): number | undefined {
  if (rawError == null) {
    return undefined;
  }

  if (typeof rawError === 'number' && Number.isFinite(rawError)) {
    return rawError;
  }

  if (typeof rawError === 'string') {
    const match = rawError.match(/contract\s*error[:\s]*(\d+)/i) ?? rawError.match(/\bcode[:\s]*(\d+)/i);
    return match ? Number(match[1]) : undefined;
  }

  if (typeof rawError === 'object') {
    const candidate = rawError as Record<string, unknown>;
    const direct = candidate.contractErrorCode ?? candidate.code ?? candidate.errorCode;
    if (typeof direct === 'number' && Number.isFinite(direct)) {
      return direct;
    }
    if (typeof direct === 'string' && /^\d+$/.test(direct)) {
      return Number(direct);
    }
    if (candidate.error != null) {
      return extractContractErrorCode(candidate.error);
    }
    if (candidate.cause != null) {
      return extractContractErrorCode(candidate.cause);
    }
  }

  return undefined;
}

/**
 * Translates a raw Soroban contract error into a structured application error.
 * Unknown errors are logged with the full RPC context and mapped to a 502.
 */
export function mapContractError(
  rawError: unknown,
  context: RpcContext = {},
  logger: Pick<Console, 'error'> = console,
): MappedContractError {
  const code = extractContractErrorCode(rawError);

  if (code !== undefined && SOROBAN_ERROR_MAP[code]) {
    return SOROBAN_ERROR_MAP[code];
  }

  logger.error('Unhandled Soroban contract error', {
    contractId: context.contractId,
    method: context.method,
    network: context.network,
    rpcUrl: context.rpcUrl,
    attempt: context.attempt,
    contractErrorCode: code,
    rawError,
  });

  return UNKNOWN_CONTRACT_ERROR;
}

/**
 * Determines whether a raw RPC failure is transient and therefore eligible for
 * an exponential backoff retry.
 */
export function isTransientRpcError(rawError: unknown): boolean {
  if (rawError == null) {
    return false;
  }

  const message = typeof rawError === 'string' ? rawError : String((rawError as { message?: unknown }).message ?? '');
  const lowered = message.toLowerCase();

  return (
    lowered.includes('timeout') ||
    lowered.includes('timed out') ||
    lowered.includes('econnreset') ||
    lowered.includes('econnrefused') ||
    lowered.includes('network') ||
    lowered.includes('temporarily unavailable') ||
    lowered.includes('503') ||
    lowered.includes('502') ||
    lowered.includes('429')
  );
}

export const MAX_RPC_RETRY_ATTEMPTS = 3;

/**
 * Executes an RPC call with exponential backoff retries for transient failures.
 * Retries at most MAX_RPC_RETRY_ATTEMPTS times before rethrowing the last error.
 */
export async function withRpcRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: { maxAttempts?: number; baseDelayMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? MAX_RPC_RETRY_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? 100;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !isTransientRpcError(error)) {
        throw error;
      }
      await sleep(baseDelayMs * 2 ** (attempt - 1));
    }
  }

  throw lastError;
}
