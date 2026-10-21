import { SorobanRpc } from '@stellar/stellar-sdk';

export interface ContractErrorMapping {
  appCode: string;
  httpStatus: number;
  message: string;
}

const KNOWN_CONTRACT_ERRORS: Record<number, ContractErrorMapping> = {
  1: { appCode: 'CONTRACT_INVALID_ARGUMENT', httpStatus: 400, message: 'Invalid argument supplied to contract' },
  2: { appCode: 'CONTRACT_UNAUTHORIZED', httpStatus: 403, message: 'Contract invocation unauthorized' },
  3: { appCode: 'CONTRACT_INSUFFICIENT_BALANCE', httpStatus: 422, message: 'Insufficient balance for contract operation' },
  4: { appCode: 'CONTRACT_NOT_FOUND', httpStatus: 404, message: 'Contract resource not found' },
  5: { appCode: 'CONTRACT_ALREADY_EXISTS', httpStatus: 409, message: 'Contract resource already exists' },
};

export class ContractError extends Error {
  constructor(
    public readonly appCode: string,
    public readonly httpStatus: number,
    message: string,
    public readonly rpcContext?: unknown,
  ) {
    super(message);
    this.name = 'ContractError';
  }
}

export class ContractErrorMapper {
  static map(error: unknown): ContractError {
    const code = ContractErrorMapper.extractContractCode(error);
    if (code !== undefined && KNOWN_CONTRACT_ERRORS[code]) {
      const mapping = KNOWN_CONTRACT_ERRORS[code];
      return new ContractError(mapping.appCode, mapping.httpStatus, mapping.message, error);
    }

    // Unknown contract error: log full RPC context and surface as 502.
    // eslint-disable-next-line no-console
    console.error('[soroban] Unknown contract error', {
      contractCode: code,
      rpcContext: error,
    });
    return new ContractError(
      'CONTRACT_UNKNOWN_ERROR',
      502,
      'Unknown contract error',
      error,
    );
  }

  private static extractContractCode(error: unknown): number | undefined {
    if (error && typeof error === 'object') {
      const anyErr = error as Record<string, unknown>;
      if (typeof anyErr.contractCode === 'number') {
        return anyErr.contractCode;
      }
      const resultCodes = anyErr.resultCodes as Record<string, unknown> | undefined;
      if (resultCodes && typeof resultCodes.contract === 'number') {
        return resultCodes.contract;
      }
    }
    return undefined;
  }
}

const MAX_RETRY_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 200;

function isTransientRpcError(error: unknown): boolean {
  if (error instanceof SorobanRpc.Server) {
    return false;
  }
  if (error && typeof error === 'object') {
    const anyErr = error as Record<string, unknown>;
    const status = anyErr.status ?? anyErr.statusCode;
    if (typeof status === 'number' && (status === 429 || status >= 500)) {
      return true;
    }
    const code = anyErr.code;
    if (code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ECONNREFUSED') {
      return true;
    }
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class SorobanService {
  constructor(private readonly server: SorobanRpc.Server) {}

  async invokeContract<T>(operation: () => Promise<T>): Promise<T> {
    let attempt = 0;
    let lastError: unknown;

    while (attempt < MAX_RETRY_ATTEMPTS) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        attempt += 1;
        if (!isTransientRpcError(error) || attempt >= MAX_RETRY_ATTEMPTS) {
          break;
        }
        const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
        // eslint-disable-next-line no-console
        console.warn('[soroban] Transient RPC failure, retrying', {
          attempt,
          backoffMs: backoff,
          error,
        });
        await sleep(backoff);
      }
    }

    throw ContractErrorMapper.map(lastError);
  }
}
