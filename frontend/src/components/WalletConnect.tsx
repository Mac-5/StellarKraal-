"use client";
import { useEffect, useState } from "react";
import { useWallet } from "@/hooks/useWallet";
import Spinner from "@/components/Spinner";
import ConfirmDialog from "@/components/ConfirmDialog";

interface Props {
  onConnect: (address: string) => void;
}

/**
 * WalletConnect — #808 / #1369
 *
 * Renders one of four visually-distinct states:
 *   connecting   → spinner + descriptive "awaiting approval" text (button disabled)
 *   connected    → green dot + truncated address + copy button + Disconnect button
 *   error        → red dot + "Connect Failed" + retry button
 *   disconnected → default "Connect Wallet" CTA
 *
 * #1369: clearer status feedback — descriptive loading text while awaiting
 * wallet approval, an install prompt with a direct link when Freighter is
 * missing, an actionable message on Stellar network mismatch, and a
 * copy-to-clipboard button next to the truncated connected address.
 *
 * All state transitions animate with a 150 ms fade via the `wc-fade`
 * CSS animation defined in globals.css. The component is keyboard-navigable
 * and screen-reader friendly (aria-live region announces state changes).
 *
 * Disconnecting — #529: clicking "Disconnect" opens a ConfirmDialog instead of
 * immediately ending the session, so an accidental click can't log the user out.
 *
 * Freighter flow — #1356: detection shows an install prompt when the extension
 * is missing, connect requests permission and stores the public key in context,
 * and disconnect clears wallet state and redirects unauthenticated users.
 */
export default function WalletConnect({ onConnect }: Props) {
  const { address, freighterInstalled, connecting, error, connect, disconnect } =
    useWallet();
  const [confirmDisconnectOpen, setConfirmDisconnectOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (address) onConnect(address);
  }, [address, onConnect]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  function handleConfirmDisconnect() {
    disconnect();
    setConfirmDisconnectOpen(false);
    // #1356: redirect unauthenticated users after wallet state is cleared.
    if (typeof window !== "undefined") {
      window.location.assign("/");
    }
  }

  async function handleCopy(address: string) {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
    } catch {
      // Clipboard unavailable — silently ignore; address remains visible.
    }
  }

  // While Freighter detection is still in progress, render nothing.
  if (freighterInstalled === null) return null;

  // ── Freighter not installed ──────────────────────────────────────────────
  if (!freighterInstalled) {
    return (
      <div
        className="mb-6 rounded-xl border border-[color:var(--token-border-strong)] bg-[color:var(--token-surface)] px-4 py-3 text-sm"
        role="alert"
        aria-live="polite"
      >
        <p className="font-semibold text-[color:var(--token-text)] mb-1">
          Freighter wallet not detected
        </p>
        <p className="text-[color:var(--token-text-muted)] mb-2">
          Install the Freighter browser extension to connect your wallet and
          interact on-chain.
        </p>
        <a
          href="https://www.freighter.app/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[color:var(--token-accent)] underline hover:opacity-80 transition-opacity"
        >
          Install Freighter →
        </a>
      </div>
    );
  }

  // ── Connected ────────────────────────────────────────────────────────────
  if (address) {
    const truncated = `${address.slice(0, 8)}…${address.slice(-6)}`;
    return (
      <>
        <div
          className="wc-fade mb-6 flex items-center justify-between gap-4 rounded-xl
            border border-[color:var(--token-border)] bg-[color:var(--token-success-subtle)]
            px-4 py-3 text-sm"
          role="status"
          aria-label={`Wallet connected: ${truncated}`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {/* Green status dot */}
            <span
              className="h-2.5 w-2.5 flex-shrink-0 rounded-full bg-[color:var(--token-success)]"
              aria-hidden="true"
            />
            <span className="font-mono text-[color:var(--token-success)] truncate font-semibold">
              {truncated}
            </span>
            <button
              onClick={() => handleCopy(address)}
              className="flex-shrink-0 rounded-md border border-[color:var(--token-border-strong)]
                bg-transparent px-2 py-1 text-xs font-semibold text-[color:var(--token-text-subtle)]
                transition-colors hover:bg-[color:var(--token-surface-raised)]
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--token-accent)]
                focus-visible:ring-offset-1"
              aria-label={copied ? "Address copied" : "Copy wallet address"}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <button
            onClick={() => setConfirmDisconnectOpen(true)}
            className="flex-shrink-0 rounded-lg border border-[color:var(--token-border-strong)]
              bg-transparent px-3 py-1.5 text-xs font-semibold text-[color:var(--token-text-subtle)]
              transition-colors hover:bg-[color:var(--token-surface-raised)]
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--token-accent)]
              focus-visible:ring-offset-1"
            aria-label="Disconnect wallet"
          >
            Disconnect
          </button>
        </div>

        {/* Disconnect confirmation — #529: prevent accidental logout */}
        <ConfirmDialog
          open={confirmDisconnectOpen}
          title="Disconnect wallet?"
          message="You'll need to reconnect Freighter to view your loans and collateral again. Your session will end."
          confirmLabel="Disconnect"
          cancelLabel="Cancel"
          variant="destructive"
          destructiveAriaLabel="Disconnect wallet and end session"
          onConfirm={handleConfirmDisconnect}
          onCancel={() => setConfirmDisconnectOpen(false)}
        />
      </>
    );
  }

  // ── Connecting ───────────────────────────────────────────────────────────
  if (connecting) {
    return (
      <div className="mb-6" role="status" aria-live="polite">
        <button
          data-onboarding-target="wallet"
          disabled
          aria-busy="true"
          aria-label="Connecting to wallet, please wait"
          className="wc-fade inline-flex items-center gap-2 rounded-xl
            bg-[color:var(--token-primary)] px-5 py-2.5 text-sm font-semibold
            text-[color:var(--token-on-primary)] opacity-75 cursor-not-allowed
            transition-opacity"
        >
          <Spinner className="h-4 w-4" label="Connecting" />
          Connecting…
        </button>
        <p className="mt-2 text-xs text-[color:var(--token-text-muted)]">
          Approve the connection request in your Freighter wallet to continue.
        </p>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (error) {
    const isNetworkMismatch = /network/i.test(error);
    return (
      <div className="mb-6" role="alert" aria-live="assertive" data-onboarding-target="wallet">
        <div
          className="wc-fade flex items-center gap-2 rounded-xl
            border border-[color:var(--token-danger)] bg-[color:var(--token-danger-subtle)]
            px-4 py-3 text-sm mb-2"
        >
          {/* Red status dot */}
          <span
            className="h-2.5 w-2.5 flex-shrink-0 rounded-full bg-[color:var(--token-danger)]"
            aria-hidden="true"
          />
          <span className="font-semibold text-[color:var(--token-danger)]">
            {isNetworkMismatch ? "Wrong Network" : "Connect Failed"}
          </span>
          <span className="text-[color:var(--token-text-muted)] ml-1 truncate text-xs">
            — {error}
          </span>
        </div>
        {isNetworkMismatch && (
          <p className="mb-2 text-xs text-[color:var(--token-text-muted)]">
            Open Freighter, switch to the correct Stellar network, then retry.
          </p>
        )}
        <button
          onClick={connect}
          className="wc-fade inline-flex items-center gap-2 rounded-xl
            bg-[color:var(--token-danger)] px-5 py-2.5 text-sm font-semibold
            text-[color:var(--token-on-danger)] transition-colors
            hover:opacity-90 focus-visible:outline-none focus-visible:ring-2
            focus-visible:ring-[color:var(--token-danger)] focus-visible:ring-offset-1"
          aria-label="Retry connecting wallet"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  // ── Disconnected (default) ────────────────────────────────────────────────
  return (
    <div className="mb-6">
      <button
          data-onboarding-target="wallet"
        onClick={connect}
        className="wc-fade inline-flex items-center gap-2 rounded-xl
          bg-[color:var(--token-primary)] px-5 py-2.5 text-sm font-semibold
          text-[color:var(--token-on-primary)] transition-colors
          hover:bg-[color:var(--token-primary-hover)]
          focus-visible:outline-none focus-visible:ring-2
          focus-visible:ring-[color:var(--token-accent)] focus-visible:ring-offset-1
          disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="Connect Freighter wallet"
      >
        Connect Wallet
      </button>
    </div>
  );
}
