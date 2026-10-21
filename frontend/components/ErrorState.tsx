import React from 'react';

export type ErrorKind = 'network' | 'contract' | 'unknown';

export interface ErrorStateProps {
  /** Raw error thrown by the app. Used only to classify; never rendered. */
  error?: unknown;
  /** Optional explicit kind override. */
  kind?: ErrorKind;
  /** Optional custom user-friendly title. */
  title?: string;
  /** Optional custom user-friendly message. */
  message?: string;
  /** Retry handler. Renders a Retry action when provided. */
  onRetry?: () => void;
  /** Go back handler. Renders a Go back action when provided. */
  onGoBack?: () => void;
  /** Support contact URL or mailto. Renders a Contact support action when provided. */
  supportHref?: string;
  /** Optional className passthrough. */
  className?: string;
}

const DEFAULT_SUPPORT_HREF = 'mailto:support@handsoff.app';

function classifyError(error: unknown): ErrorKind {
  if (!error) return 'unknown';
  const anyErr = error as { name?: string; code?: unknown; message?: string };
  const name = (anyErr.name || '').toLowerCase();
  const message = (anyErr.message || '').toLowerCase();
  const code = anyErr.code;

  if (
    name === 'networkerror' ||
    name === 'typeerror' ||
    message.includes('failed to fetch') ||
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('offline')
  ) {
    return 'network';
  }

  if (
    name === 'contracterror' ||
    name === 'sorobanerror' ||
    message.includes('contract') ||
    message.includes('invocation') ||
    message.includes('simulation') ||
    (typeof code === 'number' && code >= 1 && code <= 99)
  ) {
    return 'contract';
  }

  return 'unknown';
}

const COPY: Record<ErrorKind, { title: string; message: string }> = {
  network: {
    title: 'Connection problem',
    message:
      'We could not reach the network. Check your internet connection and try again.',
  },
  contract: {
    title: 'Transaction could not be completed',
    message:
      'The smart contract rejected this request. Review the details and try again, or contact support if the problem persists.',
  },
  unknown: {
    title: 'Something went wrong',
    message:
      'An unexpected error occurred. Please try again, or contact support if the issue continues.',
  },
};

export const ErrorState: React.FC<ErrorStateProps> = ({
  error,
  kind,
  title,
  message,
  onRetry,
  onGoBack,
  supportHref = DEFAULT_SUPPORT_HREF,
  className,
}) => {
  const resolvedKind: ErrorKind = kind ?? classifyError(error);
  const copy = COPY[resolvedKind];
  const resolvedTitle = title ?? copy.title;
  const resolvedMessage = message ?? copy.message;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '1.5rem',
        borderRadius: '0.5rem',
        border: '1px solid #f5c2c7',
        background: '#fdf2f2',
        color: '#842029',
        textAlign: 'center',
      }}
    >
      <h2 style={{ margin: 0, fontSize: '1.125rem' }}>{resolvedTitle}</h2>
      <p style={{ margin: 0, fontSize: '0.95rem' }}>{resolvedMessage}</p>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        {onRetry && (
          <button type="button" onClick={onRetry}>
            Retry
          </button>
        )}
        {onGoBack && (
          <button type="button" onClick={onGoBack}>
            Go back
          </button>
        )}
        {supportHref && (
          <a href={supportHref}>
            Contact support
          </a>
        )}
      </div>
    </div>
  );
};

export default ErrorState;
