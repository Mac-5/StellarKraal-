import React from 'react';

export type ErrorKind = 'network' | 'contract' | 'unknown';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Optional custom fallback renderer. */
  fallback?: (state: ErrorBoundaryState, actions: ErrorActions) => React.ReactNode;
  /** Optional callback invoked when the user retries. */
  onRetry?: () => void;
  /** Optional callback invoked when the user goes back. */
  onGoBack?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  kind: ErrorKind;
  message: string;
}

interface ErrorActions {
  retry: () => void;
  goBack: () => void;
  contactSupport: () => void;
}

const SUPPORT_EMAIL = 'support@handsoff.app';

/**
 * Classify an unknown thrown value into a user-facing error kind.
 * Raw technical details are never surfaced to the user.
 */
export function classifyError(error: unknown): ErrorKind {
  if (!error) return 'unknown';
  const name = (error as { name?: string }).name || '';
  const message = String((error as { message?: string }).message || '').toLowerCase();

  if (
    name === 'TypeError' &&
    (message.includes('fetch') || message.includes('network') || message.includes('failed to fetch'))
  ) {
    return 'network';
  }
  if (
    message.includes('network') ||
    message.includes('offline') ||
    message.includes('timeout') ||
    message.includes('econnrefused')
  ) {
    return 'network';
  }
  if (
    message.includes('contract') ||
    message.includes('soroban') ||
    message.includes('invocation') ||
    message.includes('simulation') ||
    message.includes('transaction')
  ) {
    return 'contract';
  }
  return 'unknown';
}

const FRIENDLY_MESSAGES: Record<ErrorKind, { title: string; body: string }> = {
  network: {
    title: 'Connection problem',
    body: 'We could not reach the network. Check your connection and try again.',
  },
  contract: {
    title: 'Transaction could not be completed',
    body: 'The smart contract rejected this request. You can retry or contact support if it keeps happening.',
  },
  unknown: {
    title: 'Something went wrong',
    body: 'An unexpected error occurred. Please try again, or contact support if the problem persists.',
  },
};

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, kind: 'unknown', message: '' };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { hasError: true, kind: classifyError(error), message: '' };
  }

  componentDidCatch(error: unknown): void {
    // Log technical details for diagnostics only; never render them.
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error);
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, kind: 'unknown', message: '' });
    this.props.onRetry?.();
  };

  private handleGoBack = (): void => {
    if (this.props.onGoBack) {
      this.props.onGoBack();
      return;
    }
    if (typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back();
    }
  };

  private handleContactSupport = (): void => {
    if (typeof window !== 'undefined') {
      window.location.href = `mailto:${SUPPORT_EMAIL}`;
    }
  };

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const actions: ErrorActions = {
      retry: this.handleRetry,
      goBack: this.handleGoBack,
      contactSupport: this.handleContactSupport,
    };

    if (this.props.fallback) {
      return this.props.fallback(this.state, actions);
    }

    const { title, body } = FRIENDLY_MESSAGES[this.state.kind];

    return (
      <div
        role="alert"
        aria-live="assertive"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
          padding: '32px',
          margin: '24px auto',
          maxWidth: '480px',
          borderRadius: '12px',
          border: '1px solid #f5c2c7',
          background: '#fdf2f2',
          color: '#1f2937',
          textAlign: 'center',
        }}
      >
        <h2 style={{ margin: 0, fontSize: '1.25rem' }}>{title}</h2>
        <p style={{ margin: 0, color: '#4b5563' }}>{body}</p>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button type="button" onClick={actions.retry} style={primaryButtonStyle}>
            Try again
          </button>
          <button type="button" onClick={actions.goBack} style={secondaryButtonStyle}>
            Go back
          </button>
          <button type="button" onClick={actions.contactSupport} style={secondaryButtonStyle}>
            Contact support
          </button>
        </div>
      </div>
    );
  }
}

const primaryButtonStyle: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: '8px',
  border: 'none',
  background: '#dc2626',
  color: '#ffffff',
  cursor: 'pointer',
  fontWeight: 600,
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: '8px',
  border: '1px solid #d1d5db',
  background: '#ffffff',
  color: '#1f2937',
  cursor: 'pointer',
};

export default ErrorBoundary;
