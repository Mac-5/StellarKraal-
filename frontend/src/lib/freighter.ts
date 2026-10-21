import { getPublicKey, isConnected, getNetworkDetails } from "@stellar/freighter-api";

export const FREIGHTER_INSTALL_URL = "https://www.freighter.app/";

export const EXPECTED_NETWORK = "TESTNET";

export type WalletConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "not-installed"
  | "wrong-network"
  | "error";

export interface WalletConnectionState {
  status: WalletConnectionStatus;
  address: string | null;
  network: string | null;
  message: string;
  installUrl?: string;
}

export const initialWalletState: WalletConnectionState = {
  status: "idle",
  address: null,
  network: null,
  message: "",
};

export function truncateAddress(address: string, lead = 6, tail = 4): string {
  if (!address) return "";
  if (address.length <= lead + tail + 3) return address;
  return `${address.slice(0, lead)}...${address.slice(-tail)}`;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to failure
  }
  return false;
}

function isFreighterAvailable(): boolean {
  if (typeof window === "undefined") return false;
  const win = window as unknown as { freighter?: unknown; freighterApi?: unknown };
  return Boolean(win.freighter || win.freighterApi);
}

export async function connectWallet(): Promise<WalletConnectionState> {
  if (!isFreighterAvailable()) {
    return {
      status: "not-installed",
      address: null,
      network: null,
      message:
        "Freighter wallet was not detected. Install the Freighter extension to connect your Stellar wallet.",
      installUrl: FREIGHTER_INSTALL_URL,
    };
  }

  try {
    const connected = await isConnected();
    if (!connected || (typeof connected === "object" && !connected.isConnected)) {
      return {
        status: "error",
        address: null,
        network: null,
        message: "Freighter is installed but not connected. Open the extension and try again.",
      };
    }

    const networkDetails = await getNetworkDetails();
    const network =
      typeof networkDetails === "object" && networkDetails !== null
        ? (networkDetails as { network?: string }).network ?? null
        : null;

    if (network && network.toUpperCase() !== EXPECTED_NETWORK) {
      return {
        status: "wrong-network",
        address: null,
        network,
        message: `Wrong network detected (${network}). Switch Freighter to ${EXPECTED_NETWORK} and reconnect.`,
      };
    }

    const publicKey = await getPublicKey();
    const address =
      typeof publicKey === "string"
        ? publicKey
        : (publicKey as { publicKey?: string })?.publicKey ?? null;

    if (!address) {
      return {
        status: "error",
        address: null,
        network,
        message: "Unable to retrieve your wallet address. Please approve the connection in Freighter.",
      };
    }

    return {
      status: "connected",
      address,
      network,
      message: "Wallet connected successfully.",
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Unknown error";
    return {
      status: "error",
      address: null,
      network: null,
      message: `Wallet connection failed: ${detail}`,
    };
  }
}
