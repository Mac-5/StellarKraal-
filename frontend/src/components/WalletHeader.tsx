'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useWallet } from '@/hooks/useWallet';
import { formatXlm } from '@/lib/formatMoney';
import { useRouter } from 'next/navigation';

const NETWORK = (process.env.NEXT_PUBLIC_NETWORK ?? 'TESTNET').toUpperCase();
const HORIZON_URL =
  NETWORK === 'MAINNET' ? 'https://horizon.stellar.org' : 'https://horizon-testnet.stellar.org';
const STELLAR_EXPERT_BASE =
  NETWORK === 'MAINNET'
    ? 'https://stellar.expert/explorer/mainnet/account'
    : 'https://stellar.expert/explorer/testnet/account';

const JWT_COOKIE_NAME = 'session';

/** Expires the JWT session cookie, clearing auth state. */
function clearSessionCookie(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${JWT_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
  document.cookie = `${JWT_COOKIE_NAME}=; path=/; max-age=0; SameSite=Strict`;
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

export default function WalletHeader() {
  const { address, freighterInstalled, connecting, connect, disconnect } = useWallet();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [xlmBalance, setXlmBalance] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Fetch XLM balance whenever address changes
  useEffect(() => {
    if (!address) {
      setXlmBalance(null);
      return;
    }
    let cancelled = false;
    setBalanceLoading(true);
    fetch(`${HORIZON_URL}/accounts/${address}`)
      .then((res) => {
        if (!res.ok) throw new Error('account not found');
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        const native = (data.balances as Array<{ asset_type: string; balance: string }>).find(
          (b) => b.asset_type === 'native'
        );
        setXlmBalance(native ? native.balance : '0');
      })
      .catch(() => {
        if (!cancelled) setXlmBalance(null);
      })
      .finally(() => {
        if (!cancelled) setBalanceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [address]);

  // Close popover on Escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        setOpen(false);
        triggerRef.current?.focus();
      }
    },
    [open]
  );

  // Close popover on click outside
  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      if (
        open &&
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    },
    [open]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [handleKeyDown, handleClickOutside]);

  async function copyAddress() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — silently ignore
    }
  }

  function handleDisconnect() {
    setOpen(false);
    // Issue #1208: clear JWT cookie and redirect to home on disconnect
    disconnect();
    clearSessionCookie();
    router.push('/');
  }

  return (
    <header className="bg-brown text-cream px-6 py-3 flex items-center justify-between">
      <span className="font-bold tracking-wide">🐄 StellarKraal</span>

      <div className="text-sm relative">
        {address ? (
          <div className="relative flex items-center gap-1">
            {/* Always-visible copy button in header bar */}
            <div className="relative">
              <button
                onClick={copyAddress}
                aria-label="Copy wallet address"
                title={copied ? 'Copied!' : 'Copy wallet address'}
                data-testid="wallet-header-copy-btn"
                className="text-cream/70 hover:text-cream transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cream/60 rounded p-1"
              >
                {copied ? (
                  /* checkmark icon */
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4 text-green-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  /* clipboard icon */
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
                    />
                  </svg>
                )}
              </button>
              {/* Tooltip */}
              {copied && (
                <span
                  role="tooltip"
                  className="absolute right-0 top-full mt-1 whitespace-nowrap rounded-md bg-brown-900 px-2 py-1 text-xs text-cream shadow-lg pointer-events-none z-50"
                  style={{ background: 'rgba(30,20,10,0.85)' }}
                >
                  Copied!
                </span>
              )}
            </div>

            {/* Trigger button */}
            <button
              ref={triggerRef}
              id="wallet-popover-trigger"
              aria-haspopup="dialog"
              aria-expanded={open}
              aria-controls="wallet-popover"
              onClick={() => setOpen((v) => !v)}
              className="font-mono bg-brown/40 px-3 py-1 rounded-lg hover:bg-brown/60 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cream/60"
            >
              {truncateAddress(address)}
            </button>

            {/* Popover */}
            {open && (
              <div
                ref={popoverRef}
                id="wallet-popover"
                role="dialog"
                aria-label="Wallet details"
                aria-modal="true"
                className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl shadow-lg border z-50
                           bg-color-surface-raised border-color-border text-color-text"
              >
                {/* Header row */}
                <div className="px-4 pt-4 pb-2 flex items-center justify-between border-b border-color-border">
                  <span className="text-xs font-semibold uppercase tracking-wider text-color-text-subtle">
                    Wallet
                  </span>
                  <span className="text-xs font-medium text-color-text-subtle bg-color-surface px-2 py-0.5 rounded-full border border-color-border">
                    {NETWORK}
                  </span>
                </div>

                <div className="px-4 py-3 space-y-3">
                  {/* Full address + copy */}
                  <div>
                    <p className="text-xs text-color-text-subtle mb-1">Address</p>
                    <div className="flex items-center gap-2">
                      <span
                        className="font-mono text-xs break-all text-color-text flex-1"
                        data-testid="wallet-full-address"
                      >
                        {address}
                      </span>
                      <button
                        onClick={copyAddress}
                        aria-label={copied ? 'Address copied' : 'Copy address'}
                        title={copied ? 'Copied!' : 'Copy address'}
                        className="shrink-0 text-color-text-subtle hover:text-color-text transition focus:outline-none focus-visible:ring-2 focus-visible:ring-color-primary rounded"
                      >
                        {copied ? (
                          /* checkmark icon */
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-4 w-4 text-green-500"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                            aria-hidden="true"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          /* clipboard icon */
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-4 w-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                            aria-hidden="true"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
                            />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* XLM balance */}
                  <div>
                    <p className="text-xs text-color-text-subtle mb-1">XLM Balance</p>
                    <p className="font-semibold text-color-text" data-testid="wallet-xlm-balance">
                      {balanceLoading ? (
                        <span className="inline-block h-4 w-16 animate-pulse rounded bg-color-border" />
                      ) : xlmBalance !== null ? (
                        `${formatXlm(Number(xlmBalance))}`
                      ) : (
                        '—'
                      )}
                    </p>
                  </div>
                </div>

                {/* Quick links */}
                <div className="px-4 pb-4 pt-1 border-t border-color-border space-y-1">
                  <a
                    href={`${STELLAR_EXPERT_BASE}/${address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="wallet-stellar-expert-link"
                    className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-sm text-color-text hover:bg-color-surface transition focus:outline-none focus-visible:ring-2 focus-visible:ring-color-primary"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4 shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
                    </svg>
                    View on Stellar Expert
                  </a>

                  <button
                    onClick={handleDisconnect}
                    data-testid="wallet-disconnect-btn"
                    className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-sm text-color-text hover:bg-color-surface transition focus:outline-none focus-visible:ring-2 focus-visible:ring-color-primary"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4 shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                      />
                    </svg>
                    Disconnect
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : freighterInstalled === false ? (
          <a
            href="https://freighter.app"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gold underline hover:text-gold/80"
          >
            Install Freighter
          </a>
        ) : (
          <button
            onClick={connect}
            disabled={connecting || freighterInstalled === null}
            className="bg-gold text-brown font-semibold px-4 py-1.5 rounded-lg hover:bg-gold/80 transition disabled:opacity-50"
          >
            {connecting ? 'Connecting…' : 'Connect Wallet'}
          </button>
        )}
      </div>
    </header>
  );
}
