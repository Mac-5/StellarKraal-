"use client";
import { useState, useEffect } from "react";
import { getAddress, isAllowed, isConnected, setAllowed } from "@/lib/freighterClient";

const STORAGE_KEY = "stellarkraal_wallet";
const EXPECTED_NETWORK = "PUBLIC";

export type WalletState = {
  address: string | null;
  freighterInstalled: boolean | null; // null = not yet detected
  connecting: boolean;
  error: string | null;
  networkMismatch: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
};

function detectNetworkMismatch(e: any): boolean {
  const msg = String(e?.message ?? e ?? "").toLowerCase();
  return msg.includes("network") || msg.includes("wrong network") || msg.includes("passphrase");
}

export function useWallet(): WalletState {
  const [address, setAddress] = useState<string | null>(null);
  const [freighterInstalled, setFreighterInstalled] = useState<boolean | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [networkMismatch, setNetworkMismatch] = useState(false);

  // On mount: detect Freighter and restore persisted address
  useEffect(() => {
    (async () => {
      const installed = await isConnected().then(() => true).catch(() => false);
      setFreighterInstalled(installed);

      if (!installed) return;

      const persisted = localStorage.getItem(STORAGE_KEY);
      if (persisted) {
        // Verify the extension still has permission before restoring
        const allowed = await isAllowed().catch(() => false);
        if (allowed) {
          setAddress(persisted);
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    })();
  }, []);

  async function connect() {
    setConnecting(true);
    setError(null);
    setNetworkMismatch(false);
    try {
      const installed = await isConnected().then(() => true).catch(() => false);
      setFreighterInstalled(installed);
      if (!installed) {
        setError("Freighter wallet is not installed. Install the extension to connect.");
        return;
      }

      await setAllowed();
      const { address: addr } = await getAddress();
      setAddress(addr);
      localStorage.setItem(STORAGE_KEY, addr);
    } catch (e: any) {
      if (detectNetworkMismatch(e)) {
        setNetworkMismatch(true);
        setError(
          `Wrong Stellar network. Please switch Freighter to ${EXPECTED_NETWORK} and try again.`
        );
      } else {
        setError(e?.message ?? "Connection failed");
      }
    } finally {
      setConnecting(false);
    }
  }

  function disconnect() {
    setAddress(null);
    setError(null);
    setNetworkMismatch(false);
    localStorage.removeItem(STORAGE_KEY);
  }

  return {
    address,
    freighterInstalled,
    connecting,
    error,
    networkMismatch,
    connect,
    disconnect,
  };
}
