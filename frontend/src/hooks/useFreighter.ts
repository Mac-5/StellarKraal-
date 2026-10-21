import { useCallback, useEffect, useState } from 'react';
import {
  isConnected as freighterIsConnected,
  getPublicKey as freighterGetPublicKey,
  setAllowed as freighterSetAllowed,
} from '@stellar/freighter-api';

const STORAGE_KEY = 'freighter:publicKey';

export interface FreighterState {
  publicKey: string | null;
  isConnected: boolean;
  isFreighterInstalled: boolean;
  isConnecting: boolean;
  error: string | null;
}

export interface UseFreighterResult extends FreighterState {
  connect: () => Promise<string | null>;
  disconnect: () => void;
  refresh: () => Promise<void>;
}

function detectFreighter(): boolean {
  if (typeof window === 'undefined') return false;
  const anyWindow = window as unknown as {
    freighter?: unknown;
    freighterApi?: unknown;
  };
  return Boolean(anyWindow.freighter || anyWindow.freighterApi);
}

function readStoredKey(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredKey(publicKey: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (publicKey) {
      window.localStorage.setItem(STORAGE_KEY, publicKey);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Ignore storage failures (private mode, quota, etc.)
  }
}

/**
 * Hook that manages the Freighter browser extension wallet lifecycle:
 * detection, connection, public key retrieval, persistence, and disconnection.
 */
export function useFreighter(): UseFreighterResult {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [isFreighterInstalled, setIsFreighterInstalled] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const installed = detectFreighter();
    setIsFreighterInstalled(installed);
    if (!installed) {
      setPublicKey(null);
      writeStoredKey(null);
      return;
    }

    try {
      const connected = await freighterIsConnected();
      if (!connected) {
        setPublicKey(null);
        writeStoredKey(null);
        return;
      }
      const key = await freighterGetPublicKey();
      if (key) {
        setPublicKey(key);
        writeStoredKey(key);
      } else {
        setPublicKey(null);
        writeStoredKey(null);
      }
    } catch {
      // Extension present but not authorized yet; fall back to stored key.
      const stored = readStoredKey();
      setPublicKey(stored);
    }
  }, []);

  const connect = useCallback(async (): Promise<string | null> => {
    setError(null);

    if (!detectFreighter()) {
      setIsFreighterInstalled(false);
      setError('Freighter wallet extension not detected. Please install it to continue.');
      return null;
    }

    setIsConnecting(true);
    try {
      await freighterSetAllowed();
      const key = await freighterGetPublicKey();
      if (!key) {
        setError('Unable to retrieve public key from Freighter.');
        return null;
      }
      setPublicKey(key);
      writeStoredKey(key);
      return key;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to connect to Freighter wallet.';
      setError(message);
      return null;
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setPublicKey(null);
    setError(null);
    writeStoredKey(null);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    publicKey,
    isConnected: Boolean(publicKey),
    isFreighterInstalled,
    isConnecting,
    error,
    connect,
    disconnect,
    refresh,
  };
}

export default useFreighter;
