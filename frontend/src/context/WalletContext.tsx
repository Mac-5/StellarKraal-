"use client";
/**
 * WalletContext — Issue #1208 / #1356
 *
 * Wraps useWallet and adds auth-aware disconnect behaviour:
 *  - Clears the `session` JWT cookie on disconnect
 *  - Redirects to `/` after disconnect
 *  - Exposes `isAuthenticated` derived from address presence
 *
 * Issue #1356 adds the Freighter connect/disconnect flow:
 *  - Detects the Freighter browser extension and exposes `isFreighterInstalled`
 *  - `connectFreighter()` requests permission and stores the public key
 *  - Connection state persists across refreshes via localStorage
 *
 * Protected pages should use this context to gate access.
 */
import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { useWallet, type WalletState } from "@/hooks/useWallet";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WalletContextValue extends WalletState {
  /** True when a wallet address is present (user is connected). */
  isAuthenticated: boolean;
  /** True when the Freighter browser extension is available. */
  isFreighterInstalled: boolean;
  /** True while a Freighter permission request is in flight. */
  isConnecting: boolean;
  /** Last connection error, if any. */
  connectError: string | null;
  /**
   * Request Freighter permission, retrieve the public key, and store it in
   * context (persisted to localStorage).
   */
  connectFreighter: () => Promise<void>;
  /**
   * Disconnect the wallet, clear the JWT session cookie, and redirect to `/`.
   * This is the canonical disconnect action to use throughout the app.
   */
  disconnectAndClear: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = "freighter_public_key";
const FREIGHTER_URL = "https://www.freighter.app/";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Clears the `session` JWT cookie that the backend sets on login.
 * Works in all modern browsers — sets Max-Age=0 to immediately expire the cookie.
 */
function clearSessionCookie(): void {
  if (typeof document === "undefined") return;
  // Expire across common path/domain combinations
  document.cookie = "session=; path=/; max-age=0; SameSite=Lax";
  document.cookie = "session=; path=/; max-age=0; SameSite=Strict";
}

/** Returns true when the Freighter extension has injected its API. */
function detectFreighter(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as {
    freighter?: unknown;
    freighterApi?: unknown;
  };
  return Boolean(w.freighter || w.freighterApi);
}

/**
 * Requests permission from Freighter and returns the active public key.
 * Supports both the legacy `window.freighter` and `window.freighterApi`
 * injection shapes used across Freighter versions.
 */
async function requestFreighterPublicKey(): Promise<string> {
  const w = window as unknown as {
    freighter?: {
      requestAccess?: () => Promise<unknown>;
      getPublicKey?: () => Promise<string>;
    };
    freighterApi?: {
      requestAccess?: () => Promise<unknown>;
      getPublicKey?: () => Promise<string>;
    };
  };
  const api = w.freighter ?? w.freighterApi;
  if (!api) {
    throw new Error("Freighter extension not detected");
  }
  if (typeof api.requestAccess === "function") {
    await api.requestAccess();
  }
  if (typeof api.getPublicKey !== "function") {
    throw new Error("Freighter API does not expose getPublicKey");
  }
  const publicKey = await api.getPublicKey();
  if (!publicKey) {
    throw new Error("Freighter did not return a public key");
  }
  return publicKey;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const WalletContext = createContext<WalletContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const wallet = useWallet();
  const router = useRouter();

  const [isFreighterInstalled, setIsFreighterInstalled] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  // Detect the extension on mount and restore any persisted public key.
  useEffect(() => {
    setIsFreighterInstalled(detectFreighter());

    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && !wallet.address) {
      wallet.connect(stored);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Connect flow:
   * 1. Verify the extension is present (prompt install otherwise)
   * 2. Request permission + public key from Freighter
   * 3. Store the public key in context and localStorage
   */
  const connectFreighter = useCallback(async () => {
    setConnectError(null);

    if (!detectFreighter()) {
      setIsFreighterInstalled(false);
      setConnectError(
        `Freighter wallet not found. Install it from ${FREIGHTER_URL} and refresh.`
      );
      if (typeof window !== "undefined") {
        window.open(FREIGHTER_URL, "_blank", "noopener,noreferrer");
      }
      return;
    }

    setIsConnecting(true);
    try {
      const publicKey = await requestFreighterPublicKey();
      wallet.connect(publicKey);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, publicKey);
      }
    } catch (err) {
      setConnectError(
        err instanceof Error ? err.message : "Failed to connect Freighter"
      );
    } finally {
      setIsConnecting(false);
    }
  }, [wallet]);

  /**
   * Full disconnect:
   * 1. Call the base `disconnect()` which clears address state + localStorage
   * 2. Remove the persisted Freighter public key
   * 3. Expire the JWT session cookie
   * 4. Redirect to home page
   */
  const disconnectAndClear = useCallback(() => {
    wallet.disconnect();
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    clearSessionCookie();
    router.push("/");
  }, [wallet, router]);

  const isAuthenticated = Boolean(wallet.address);

  const value = useMemo<WalletContextValue>(
    () => ({
      ...wallet,
      isAuthenticated,
      isFreighterInstalled,
      isConnecting,
      connectError,
      connectFreighter,
      disconnectAndClear,
    }),
    [
      wallet,
      isAuthenticated,
      isFreighterInstalled,
      isConnecting,
      connectError,
      connectFreighter,
      disconnectAndClear,
    ]
  );

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * useWalletContext — use this in components that need the full auth-aware
 * wallet state (isAuthenticated, disconnectAndClear).
 *
 * Falls back gracefully when used outside the WalletProvider (returns null
 * for isAuthenticated, noop for disconnectAndClear) so existing code that
 * only consumes `useWallet()` keeps working.
 */
export function useWalletContext(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error("useWalletContext must be used within a WalletProvider");
  }
  return ctx;
}
