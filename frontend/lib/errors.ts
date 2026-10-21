export type ErrorKind = 'network' | 'contract' | 'unknown';

export interface AppError {
  kind: ErrorKind;
  title: string;
  message: string;
  recovery: string;
}

const NETWORK_PATTERNS = [
  /failed to fetch/i,
  /network ?error/i,
  /fetch failed/i,
  /timeout/i,
  /econnrefused/i,
  /enotfound/i,
  /offline/i,
];

const CONTRACT_PATTERNS = [
  /contract/i,
  /soroban/i,
  /invocation/i,
  /simulation/i,
  /host function/i,
  /wasm/i,
  /xdr/i,
];

function matches(patterns: RegExp[], text: string): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function rawText(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return '';
}

/**
 * Normalizes any thrown value into a user-friendly error with a recovery path.
 * Raw technical strings are never surfaced to the UI.
 */
export function toAppError(error: unknown): AppError {
  const text = rawText(error);

  if (matches(NETWORK_PATTERNS, text)) {
    return {
      kind: 'network',
      title: 'Connection problem',
      message:
        'We could not reach the server. Check your internet connection and try again.',
      recovery: 'Retry',
    };
  }

  if (matches(CONTRACT_PATTERNS, text)) {
    return {
      kind: 'contract',
      title: 'Transaction could not be completed',
      message:
        'The smart contract rejected this request. Review the details and try again, or contact support if the problem persists.',
      recovery: 'Retry',
    };
  }

  return {
    kind: 'unknown',
    title: 'Something went wrong',
    message:
      'An unexpected error occurred. Please try again, or contact support if it keeps happening.',
    recovery: 'Retry',
  };
}
