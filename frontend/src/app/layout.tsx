import type { Metadata, Viewport } from 'next';
import './globals.css';
import KeyboardShortcutsProvider from '@/components/KeyboardShortcutsProvider';
import Link from 'next/link';
import OfflineBanner from '@/components/OfflineBanner';
import Navbar from '@/components/Navbar';
import MobileBottomNav from '@/components/MobileBottomNav';
import ThemeProvider, { ThemeScript } from '@/components/ThemeProvider';
import { ToastProvider, ToastContainer } from '@/components/toast';
import SWRErrorToastConfig from '@/components/SWRErrorToastConfig';
import SkipToContent from '@/components/SkipToContent';
import NetworkMismatchBanner from '@/components/NetworkMismatchBanner';
import PrintDateScript from '@/components/PrintDateScript';
import TopProgressBar from '@/components/TopProgressBar';
import SessionTimeoutBanner from '@/components/SessionTimeoutBanner';
import WhatsNewProvider from '@/components/WhatsNewProvider';
import InitialLoadingScreen from '@/components/InitialLoadingScreen';
// Global error boundary — Issue #1399
import ErrorBoundary from '@/components/ErrorBoundary';
// i18n — Issue #1207: Kiswahili locale support
import { I18nProvider } from '@/context/I18nContext';
// Wallet auth context — Issue #1208
import { WalletProvider } from '@/context/WalletContext';

export const metadata: Metadata = {
  title: "Handsoff",
  description: "Handsoff application",
};

/**
 * Typography scale (design tokens)
 * ---------------------------------
 * Tokens are exposed as CSS custom properties on :root so every component
 * consumes the same scale instead of arbitrary font-size/weight/line-height
 * values. Body text is 16px minimum and all pairings target WCAG AA contrast
 * when used with the semantic foreground colors.
 *
 * | Token        | Size / Line-height | Weight |
 * | ------------ | ------------------ | ------ |
 * | --text-h1    | 2.5rem / 1.2      | 700    |
 * | --text-h2    | 2rem / 1.25       | 700    |
 * | --text-h3    | 1.75rem / 1.3     | 600    |
 * | --text-h4    | 1.5rem / 1.35     | 600    |
 * | --text-h5    | 1.25rem / 1.4     | 600    |
 * | --text-h6    | 1.125rem / 1.4    | 600    |
 * | --text-body  | 1rem / 1.6        | 400    |
 * | --text-label | 0.875rem / 1.4    | 500    |
 * | --text-caption | 0.75rem / 1.4   | 400    |
 */
const typographyScale = `
  :root {
    --font-sans: ${inter.style.fontFamily};

    --text-h1-size: 2.5rem;
    --text-h1-line-height: 1.2;
    --text-h1-weight: 700;

    --text-h2-size: 2rem;
    --text-h2-line-height: 1.25;
    --text-h2-weight: 700;

    --text-h3-size: 1.75rem;
    --text-h3-line-height: 1.3;
    --text-h3-weight: 600;

    --text-h4-size: 1.5rem;
    --text-h4-line-height: 1.35;
    --text-h4-weight: 600;

    --text-h5-size: 1.25rem;
    --text-h5-line-height: 1.4;
    --text-h5-weight: 600;

    --text-h6-size: 1.125rem;
    --text-h6-line-height: 1.4;
    --text-h6-weight: 600;

    --text-body-size: 1rem;
    --text-body-line-height: 1.6;
    --text-body-weight: 400;

    --text-label-size: 0.875rem;
    --text-label-line-height: 1.4;
    --text-label-weight: 500;

    --text-caption-size: 0.75rem;
    --text-caption-line-height: 1.4;
    --text-caption-weight: 400;
  }

  body {
    font-family: var(--font-sans), system-ui, sans-serif;
    font-size: var(--text-body-size);
    line-height: var(--text-body-line-height);
    font-weight: var(--text-body-weight);
  }

  h1 {
    font-size: var(--text-h1-size);
    line-height: var(--text-h1-line-height);
    font-weight: var(--text-h1-weight);
  }

  h2 {
    font-size: var(--text-h2-size);
    line-height: var(--text-h2-line-height);
    font-weight: var(--text-h2-weight);
  }

  h3 {
    font-size: var(--text-h3-size);
    line-height: var(--text-h3-line-height);
    font-weight: var(--text-h3-weight);
  }

  h4 {
    font-size: var(--text-h4-size);
    line-height: var(--text-h4-line-height);
    font-weight: var(--text-h4-weight);
  }

  h5 {
    font-size: var(--text-h5-size);
    line-height: var(--text-h5-line-height);
    font-weight: var(--text-h5-weight);
  }

  h6 {
    font-size: var(--text-h6-size);
    line-height: var(--text-h6-line-height);
    font-weight: var(--text-h6-weight);
  }

  .text-label {
    font-size: var(--text-label-size);
    line-height: var(--text-label-line-height);
    font-weight: var(--text-label-weight);
  }

  .text-caption {
    font-size: var(--text-caption-size);
    line-height: var(--text-caption-line-height);
    font-weight: var(--text-caption-weight);
  }
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className="min-h-screen overflow-x-hidden px-4"
        style={{
          backgroundColor: 'var(--color-bg)',
          color: 'var(--color-text)',
        }}
      >
        {/* Inline animated SVG loading screen for initial app load (#839) */}
        <div id="initial-loading-screen" role="status" aria-label="Loading StellarKraal">
          <style
            dangerouslySetInnerHTML={{
              __html: `
            #initial-loading-screen {
              position: fixed;
              top: 0; left: 0; right: 0; bottom: 0;
              z-index: 99999;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              background-color: var(--color-bg, #fefcf8);
              color: var(--color-text, #2a1b0b);
              transition: opacity 0.4s ease, visibility 0.4s ease;
            }
            #initial-loading-screen.fade-out {
              opacity: 0;
              visibility: hidden;
              pointer-events: none;
            }
            .sk-loading-logo {
              width: 72px;
              height: 72px;
              animation: sk-pulse-glow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
            }
            .sk-loading-text {
              margin-top: 0.75rem;
              font-family: system-ui, -apple-system, sans-serif;
              font-size: 0.875rem;
              font-weight: 600;
              letter-spacing: 0.05em;
              color: var(--token-primary, #5d3c15);
            }
            @keyframes sk-pulse-glow {
              0%, 100% { transform: scale(1); opacity: 0.85; }
              50% { transform: scale(1.08); opacity: 1; }
            }
            @media (prefers-reduced-motion: reduce) {
              .sk-loading-logo {
                animation: none !important;
              }
            }
          `,
            }}
          />
          <svg
            className="sk-loading-logo"
            viewBox="0 0 80 80"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <ellipse
              cx="40"
              cy="48"
              rx="20"
              ry="12"
              fill="var(--token-surface, #ffffff)"
              stroke="var(--token-primary, #5d3c15)"
              strokeWidth="2.5"
            />
            <ellipse
              cx="40"
              cy="28"
              rx="10"
              ry="8"
              fill="var(--token-surface, #ffffff)"
              stroke="var(--token-primary, #5d3c15)"
              strokeWidth="2.5"
            />
            <path
              d="M30 25 Q26 18 29 16 Q32 20 30 25Z"
              fill="var(--token-primary, #5d3c15)"
              opacity="0.7"
            />
            <path
              d="M50 25 Q54 18 51 16 Q48 20 50 25Z"
              fill="var(--token-primary, #5d3c15)"
              opacity="0.7"
            />
            <circle cx="36" cy="27" r="1.5" fill="var(--token-primary, #5d3c15)" />
            <circle cx="44" cy="27" r="1.5" fill="var(--token-primary, #5d3c15)" />
            <circle cx="26" cy="18" r="3" fill="var(--token-accent, #d4a017)" />
          </svg>
          <div className="sk-loading-text">StellarKraal</div>
        </div>
        <InitialLoadingScreen />

        {/*
         * PrintDateScript injects the current date as data-print-date on <body>
         * so the CSS print footer (body::after { content: attr(data-print-date) })
         * can display the print date without a server round-trip (#811).
         */}
        <PrintDateScript />
        <ThemeScript />
        <ThemeProvider>
          <KeyboardShortcutsProvider>
            <I18nProvider>
            <WalletProvider>
            <ToastProvider>
            <SWRErrorToastConfig>
              <SkipToContent />
              <TopProgressBar />
              <SessionTimeoutBanner />
              <NetworkMismatchBanner />
              <OfflineBanner />
              {/* Top utility nav — hidden when printing */}
              <nav
                className="flex gap-4 px-6 py-3 text-sm border-b no-print"
                aria-label="Utility navigation"
                data-print="hide"
                style={{
                  borderColor: 'var(--color-nav-border)',
                  backgroundColor: 'var(--color-nav-bg)',
                }}
              >
                <Link
                  href="/"
                  className="font-semibold hover:opacity-70 transition"
                  style={{ color: 'var(--color-text)' }}
                >
                  StellarKraal
                </Link>
                <span className="flex-1" />
                <Link
                  href="/loans"
                  className="hover:opacity-100 transition"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  Loans
                </Link>
                <Link
                  href="/collateral"
                  className="hover:opacity-100 transition"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  Collateral
                </Link>
                <Link
                  href="/transactions"
                  className="hover:opacity-100 transition"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  Transactions
                </Link>
                <Link
                  href="/help/faq"
                  className="hover:opacity-100 transition"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  FAQ
                </Link>
                <Link
                  href="/profile"
                  className="hover:opacity-100 transition"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  Profile
                </Link>
                <Link
                  href="/settings"
                  className="hover:opacity-100 transition"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  Settings
                </Link>
              </nav>
              <Navbar />
              <MobileBottomNav />
              <main id="main-content" className="pb-20 md:pb-0">
                {/* Global error boundary — Issue #1399 */}
                <ErrorBoundary fullPage>{children}</ErrorBoundary>
              </main>
              <ToastContainer />
              <WhatsNewProvider />
            </SWRErrorToastConfig>
            </ToastProvider>
            </WalletProvider>
            </I18nProvider>
          </KeyboardShortcutsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
