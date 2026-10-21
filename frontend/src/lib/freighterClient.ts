'use client';

import {
  getAddress as freighterGetAddress,
  getNetworkDetails as freighterGetNetworkDetails,
  isAllowed as freighterIsAllowed,
  isConnected as freighterIsConnected,
  setAllowed as freighterSetAllowed,
  signTransaction as freighterSignTransaction,
} from '@stellar/freighter-api';

export type FreighterNetworkDetails = {
  network: string;
  networkUrl?: string;
  networkPassphrase?: string;
  sorobanRpcUrl?: string;
};

type FreighterTestApi = Partial<{
  isConnected: () => Promise<{ isConnected: boolean }>;
  isAllowed: () => Promise<{ isAllowed: boolean }>;
  setAllowed: () => Promise<{ isAllowed: boolean }>;
  getAddress: () => Promise<{ address: string }>;
  getNetworkDetails: () => Promise<FreighterNetworkDetails>;
  signTransaction: (xdr: string, opts?: { network?: string }) => Promise<{ signedTxXdr: string }>;
}>;

declare global {
  interface Window {
    __STELLARKRAAL_E2E__?: FreighterTestApi & {
      submitSignedXdr?: (signedXdr: string) => Promise<string> | string;
    };
  }
}

const STORAGE_KEY = 'stellarkraal.freighter.publicKey';
const FREIGHTER_INSTALL_URL = 'https://www.freighter.app/';

export type FreighterConnection = {
  publicKey: string;
  network?: FreighterNetworkDetails;
};

function getTestApi(): FreighterTestApi | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.__STELLARKRAAL_E2E__;
}

export async function isConnected() {
  const mock = getTestApi();
  if (mock?.isConnected) return mock.isConnected();
  return freighterIsConnected();
}

export async function isAllowed() {
  const mock = getTestApi();
  if (mock?.isAllowed) return mock.isAllowed();
  return freighterIsAllowed();
}

export async function setAllowed() {
  const mock = getTestApi();
  if (mock?.setAllowed) return mock.setAllowed();
  return freighterSetAllowed();
}

export async function getAddress() {
  const mock = getTestApi();
  if (mock?.getAddress) return mock.getAddress();
  return freighterGetAddress();
}

export async function getNetworkDetails() {
  const mock = getTestApi();
  if (mock?.getNetworkDetails) return mock.getNetworkDetails();
  return freighterGetNetworkDetails();
}

export async function signTransaction(
  xdr: string,
  opts?: { network?: string; networkPassphrase?: string; address?: string }
) {
  const mock = getTestApi();
  if (mock?.signTransaction) return mock.signTransaction(xdr, opts);
  return freighterSignTransaction(xdr, {
    networkPassphrase: opts?.networkPassphrase ?? opts?.network,
    address: opts?.address,
  });
}

/**
 * Detects whether the Freighter browser extension is available.
 * Returns false in non-browser environments or when the extension is absent.
 */
export async function isFreighterInstalled(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (getTestApi()) return true;
  try {
    const result = await freighterIsConnected();
    return Boolean(result?.isConnected);
  } catch {
    return false;
  }
}

/**
 * Opens the Freighter install page in a new tab. Used when the extension is
 * not detected so users can install it before connecting.
 */
export function promptFreighterInstall(): void {
  if (typeof window === 'undefined') return;
  window.open(FREIGHTER_INSTALL_URL, '_blank', 'noopener,noreferrer');
}

/**
 * Requests Freighter permission and retrieves the user's public key.
 * Throws a descriptive error when the extension is missing or access is denied.
 */
export async function connectFreighter(): Promise<FreighterConnection> {
  const installed = await isFreighterInstalled();
  if (!installed) {
    throw new Error('Freighter wallet extension not detected. Please install Freighter to continue.');
  }

  const allowed = await isAllowed();
  if (!allowed?.isAllowed) {
    const permission = await setAllowed();
    if (!permission?.isAllowed) {
      throw new Error('Freighter access was not granted. Please approve the connection request.');
    }
  }

  const addressResult = await getAddress();
  const publicKey = addressResult?.address;
  if (!publicKey) {
    throw new Error('Unable to retrieve public key from Freighter.');
  }

  let network: FreighterNetworkDetails | undefined;
  try {
    network = await getNetworkDetails();
  } catch {
    network = undefined;
  }

  persistPublicKey(publicKey);
  return { publicKey, network };
}

/**
 * Clears the persisted wallet state. Callers are responsible for clearing
 * React context and redirecting unauthenticated users.
 */
export function disconnectFreighter(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage errors (e.g. private mode).
  }
}

/**
 * Restores a previously connected public key from localStorage so the
 * connection survives page refreshes.
 */
export function getPersistedPublicKey(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function persistPublicKey(publicKey: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, publicKey);
  } catch {
    // Ignore storage errors (e.g. private mode).
  }
}
