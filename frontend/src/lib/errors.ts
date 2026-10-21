/**
 * User-friendly error mapping for Soroban / Freighter transaction flows.
 *
 * Raw RPC and wallet errors are noisy JSON blobs. This module normalizes them
 * into short, actionable messages that can be surfaced directly in the UI.
 */

export type SigningPhase = "build" | "sign" | "submit";

export interface FriendlyError {
  /** Short, user-facing message. */
  message: string;
  /** Optional longer hint describing what the user can do next. */
  hint?: string;
  /** True when the user rejected the request in their wallet. */
  rejected: boolean;
  /** Original error, kept for logging/debugging. */
  cause?: unknown;
}

/** Status copy shown alongside the spinner for each signing phase. */
export const PHASE_MESSAGES: Record<SigningPhase, string> = {
  build: "Building transaction…",
  sign: "Waiting for you to sign in Freighter…",
  submit: "Submitting transaction to the network…",
};

/** Common Soroban / Stellar RPC error codes mapped to friendly copy. */
const SOROBAN_ERROR_MESSAGES: Record<string, string> = {
  tx_insufficient_balance: "Insufficient balance to cover this transaction.",
  tx_insufficient_fee: "The network fee is too low. Please try again.",
  tx_bad_seq: "Transaction sequence is out of date. Please retry.",
  tx_bad_auth: "Authorization failed. Please reconnect your wallet and retry.",
  tx_no_source_account: "Source account was not found on the network.",
  tx_too_late: "The transaction expired before it was submitted. Please retry.",
  tx_too_early: "The transaction is not valid yet. Please retry shortly.",
  tx_missing_operation: "The transaction is missing an operation.",
  tx_failed: "The transaction failed on-chain. No changes were applied.",
  op_underfunded: "Insufficient funds for this operation.",
  op_no_trust: "The destination account does not trust this asset.",
  op_not_authorized: "This operation is not authorized for your account.",
  op_low_reserve: "The account does not have enough reserve for this operation.",
  op_malformed: "The operation was malformed and could not be processed.",
  op_already_exists: "This operation has already been applied.",
  op_src_no_trust: "The source account does not trust this asset.",
  op_src_not_authorized: "The source account is not authorized for this operation.",
  op_line_full: "The destination account cannot hold more of this asset.",
  op_no_issuer: "The asset issuer could not be found.",
  op_sell_no_trust: "The account cannot sell an asset it does not trust.",
  op_buy_no_trust: "The account cannot buy an asset it does not trust.",
  op_not_found: "The referenced operation could not be found.",
  op_src_underfunded: "The source account has insufficient funds for this operation.",
  op_dest_underfunded: "The destination account has insufficient funds.",
  op_has_sub_entries: "The account still has sub-entries and cannot be merged.",
  op_immutable: "This entry is immutable and cannot be modified.",
  op_already_initialized: "This contract has already been initialized.",
  op_not_initialized: "This contract has not been initialized yet.",
  op_invalid_input: "The contract rejected the input as invalid.",
  op_insufficient_balance: "Insufficient balance for this contract call.",
  op_unauthorized: "This contract call is not authorized.",
  op_arithmetic_overflow: "A calculation overflowed. Please adjust the amount.",
  op_division_by_zero: "A calculation divided by zero. Please adjust the amount.",
  op_budget_exceeded: "The transaction exceeded the compute budget. Please retry.",
  op_storage_full: "Contract storage is full and cannot accept more data.",
  op_missing_value: "A required value was missing from the contract call.",
  op_existing_value: "A value already exists where none was expected.",
  op_invocation_failed: "The contract invocation failed. No changes were applied.",
  op_wasm_instantiation_failed: "The contract could not be instantiated.",
  op_wasm_vm_error: "The contract encountered a runtime error.",
  op_context_error: "The contract call context was invalid.",
  op_balance_error: "The contract reported a balance error.",
  op_value_error: "The contract reported an invalid value.",
  op_auth_error: "The contract reported an authorization error.",
  op_storage_error: "The contract reported a storage error.",
  op_event_error: "The contract reported an event error.",
  op_budget_error: "The contract reported a budget error.",
  op_invalid_action: "The contract rejected this action as invalid.",
  op_internal_error: "The contract hit an internal error. Please retry.",
  op_unexpected_error: "The contract hit an unexpected error. Please retry.",
  op_exceeded_limit: "The contract call exceeded a configured limit.",
  op_not_supported: "This operation is not supported by the contract.",
  op_unknown_error: "The contract returned an unknown error.",
};

const REJECTION_PATTERNS = [
  /user (declined|rejected|cancel+ed)/i,
  /request (was )?(rejected|declined|cancel+ed)/i,
  /denied by (the )?user/i,
  /freighter.*(reject|declin|cancel)/i,
  /transaction (was )?(rejected|declined|cancel+ed)/i,
];

const NETWORK_PATTERNS = [
  /failed to fetch/i,
  /network ?error/i,
  /timeout/i,
  /econnrefused/i,
  /rpc.*(unavailable|error)/i,
];

function extractRawMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const anyErr = error as { message?: unknown; error?: unknown; details?: unknown };
    if (typeof anyErr.message === "string") return anyErr.message;
    if (typeof anyErr.error === "string") return anyErr.error;
    if (typeof anyErr.details === "string") return anyErr.details;
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error ?? "");
}

/**
 * Find a known Soroban error code inside an arbitrary error payload.
 * RPC errors often embed the code in a JSON string or nested object.
 */
function findSorobanCode(raw: string): string | undefined {
  for (const code of Object.keys(SOROBAN_ERROR_MESSAGES)) {
    if (raw.includes(code)) return code;
  }
  return undefined;
}

/**
 * Convert any thrown value from the signing flow into a friendly error.
 * Never throws; always returns a usable message.
 */
export function toFriendlyError(error: unknown): FriendlyError {
  const raw = extractRawMessage(error);

  if (REJECTION_PATTERNS.some((pattern) => pattern.test(raw))) {
    return {
      message: "Signing was cancelled.",
      hint: "You can retry the transaction whenever you are ready.",
      rejected: true,
      cause: error,
    };
  }

  const code = findSorobanCode(raw);
  if (code) {
    return {
      message: SOROBAN_ERROR_MESSAGES[code],
      hint: "If this keeps happening, check your balance and try again.",
      rejected: false,
      cause: error,
    };
  }

  if (NETWORK_PATTERNS.some((pattern) => pattern.test(raw))) {
    return {
      message: "Could not reach the Stellar network.",
      hint: "Check your connection and try again.",
      rejected: false,
      cause: error,
    };
  }

  return {
    message: "Something went wrong while processing the transaction.",
    hint: "Please try again. If the problem persists, contact support.",
    rejected: false,
    cause: error,
  };
}

/** Build a Stellar explorer link for a confirmed transaction hash. */
export function explorerTxUrl(hash: string, network: "public" | "testnet" = "testnet"): string {
  const base = network === "public" ? "https://stellar.expert/explorer/public" : "https://stellar.expert/explorer/testnet";
  return `${base}/tx/${hash}`;
}
