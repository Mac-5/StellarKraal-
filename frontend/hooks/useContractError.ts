import { useCallback, useMemo, useState } from 'react';

export type ErrorKind = 'network' | 'contract' | 'unknown';

export interface ErrorRecoveryAction {
  label: string;
  kind: 'retry' | 'goBack' | 'contactSupport';
}

export interface StandardizedError {
  kind: ErrorKind;
  title: string;
  message: string;
  actions: ErrorRecoveryAction[];
}

const NETWORK_ERROR_MESSAGE =
  'We could not reach the network. Please check your connection and try again.';
const CONTRACT_ERROR_MESSAGE =
  'The contract could not complete this request. You can retry, or contact support if the problem continues.';
const UNKNOWN_ERROR_MESSAGE =
  'Something went wrong while processing your request. Please try again.';

const RETRY_ACTION: ErrorRecoveryAction = { label: 'Retry', kind: 'retry' };
const GO_BACK_ACTION: ErrorRecoveryAction = { label: 'Go back', kind: 'goBack' };
const CONTACT_SUPPORT_ACTION: ErrorRecoveryAction = {
  label: 'Contact support',
  kind: 'contactSupport',
};

function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) {
    return true;
  }
  if (typeof error === 'object' && error !== null) {
    const candidate = error as { name?: unknown; code?: unknown; message?: unknown };
    if (typeof candidate.name === 'string' && candidate.name === 'NetworkError') {
      return true;
    }
    if (typeof candidate.code === 'string' && candidate.code === 'NETWORK_ERROR') {
      return true;
    }
    if (
      typeof candidate.message === 'string' &&
      /network|fetch|failed to fetch|timeout/i.test(candidate.message)
    ) {
      return true;
    }
  }
  return false;
}

function isContractError(error: unknown): boolean {
  if (typeof error === 'object' && error !== null) {
    const candidate = error as { name?: unknown; code?: unknown; contractError?: unknown };
    if (candidate.contractError !== undefined) {
      return true;
    }
    if (typeof candidate.name === 'string' && /contract/i.test(candidate.name)) {
      return true;
    }
    if (typeof candidate.code === 'string' && /contract/i.test(candidate.code)) {
      return true;
    }
  }
  return false;
}

/**
 * Maps any thrown value into a user-friendly, actionable error state.
 * Raw technical error strings are never surfaced to the UI.
 */
export function toStandardizedError(error: unknown): StandardizedError {
  if (isNetworkError(error)) {
    return {
      kind: 'network',
      title: 'Connection problem',
      message: NETWORK_ERROR_MESSAGE,
      actions: [RETRY_ACTION, CONTACT_SUPPORT_ACTION],
    };
  }

  if (isContractError(error)) {
    return {
      kind: 'contract',
      title: 'Contract request failed',
      message: CONTRACT_ERROR_MESSAGE,
      actions: [RETRY_ACTION, GO_BACK_ACTION, CONTACT_SUPPORT_ACTION],
    };
  }

  return {
    kind: 'unknown',
    title: 'Unexpected error',
    message: UNKNOWN_ERROR_MESSAGE,
    actions: [RETRY_ACTION, GO_BACK_ACTION],
  };
}

export interface UseContractErrorResult {
  error: StandardizedError | null;
  setError: (error: unknown) => void;
  clearError: () => void;
  retry: () => void;
}

/**
 * Hook that standardizes error handling for contract and network failures,
 * exposing a user-friendly error state with recovery actions.
 */
export function useContractError(onRetry?: () => void): UseContractErrorResult {
  const [error, setErrorState] = useState<StandardizedError | null>(null);

  const setError = useCallback((nextError: unknown) => {
    setErrorState(toStandardizedError(nextError));
  }, []);

  const clearError = useCallback(() => {
    setErrorState(null);
  }, []);

  const retry = useCallback(() => {
    setErrorState(null);
    onRetry?.();
  }, [onRetry]);

  return useMemo(
    () => ({ error, setError, clearError, retry }),
    [error, setError, clearError, retry],
  );
}

export default useContractError;
