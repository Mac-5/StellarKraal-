import {
  Contract,
  SorobanRpc,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  xdr,
  Transaction,
  Keypair,
  Address,
} from '@stellar/stellar-sdk';
import { signTransaction } from '@stellar/freighter-api';

const RPC_URL = import.meta.env.VITE_SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
const NETWORK_PASSPHRASE = import.meta.env.VITE_NETWORK_PASSPHRASE || Networks.TESTNET;
const EXPLORER_BASE = import.meta.env.VITE_EXPLORER_URL || 'https://stellar.expert/explorer/testnet';

export type SigningPhase = 'build' | 'sign' | 'submit' | 'confirm';

export interface SigningProgress {
  phase: SigningPhase;
  message: string;
}

export interface SigningResult {
  hash: string;
  ledger?: number;
  explorerUrl: string;
}

export class SorobanSigningError extends Error {
  code: string;
  userMessage: string;
  rejected: boolean;

  constructor(code: string, userMessage: string, rejected = false) {
    super(userMessage);
    this.name = 'SorobanSigningError';
    this.code = code;
    this.userMessage = userMessage;
    this.rejected = rejected;
  }
}

const PHASE_MESSAGES: Record<SigningPhase, string> = {
  build: 'Building transaction…',
  sign: 'Waiting for you to sign in Freighter…',
  submit: 'Submitting transaction to the network…',
  confirm: 'Confirming transaction on the ledger…',
};

const ERROR_MESSAGES: Record<string, string> = {
  tx_insufficient_balance: 'Insufficient balance to cover the transaction fees.',
  tx_bad_seq: 'Transaction sequence is out of date. Please refresh and try again.',
  tx_too_late: 'The transaction expired before it could be submitted. Please try again.',
  tx_too_early: 'The transaction is not valid yet. Please try again shortly.',
  tx_bad_auth: 'Authorization failed. Please reconnect your wallet and try again.',
  tx_insufficient_fee: 'The network fee is too low. Please try again.',
  tx_no_source_account: 'Source account not found on the network.',
  tx_malformed: 'The transaction was malformed and could not be submitted.',
  op_underfunded: 'Your account does not have enough funds for this operation.',
  op_no_trust: 'A required trustline is missing for this operation.',
  op_not_authorized: 'This operation is not authorized for your account.',
  op_low_reserve: 'Your account does not meet the minimum reserve requirement.',
  soroban_invalid_action: 'The contract rejected this action as invalid.',
  soroban_invalid_input: 'The contract received invalid input for this operation.',
  soroban_budget_exceeded: 'The transaction exceeded the allowed compute budget.',
  soroban_missing_ledger_entry: 'A required ledger entry was not found.',
  soroban_restore_required: 'This transaction requires archived state to be restored first.',
};

function mapErrorCode(code: string): string {
  return ERROR_MESSAGES[code] || 'Something went wrong while processing the transaction. Please try again.';
}

function extractErrorCode(err: unknown): string {
  if (!err) return 'unknown';
  const anyErr = err as any;
  const raw = anyErr?.response?.data?.extras?.result_codes || anyErr?.result_codes || anyErr?.code;
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object') {
    const tx = raw.transaction;
    const op = Array.isArray(raw.operations) ? raw.operations[0] : undefined;
    return op || tx || 'unknown';
  }
  const message = String(anyErr?.message || '');
  const match = message.match(/[a-z_]+_[a-z_]+/);
  return match ? match[0] : 'unknown';
}

function isUserRejection(err: unknown): boolean {
  const message = String((err as any)?.message || err || '').toLowerCase();
  return message.includes('reject') || message.includes('denied') || message.includes('cancel') || message.includes('user declined');
}

function toSigningError(err: unknown): SorobanSigningError {
  if (err instanceof SorobanSigningError) return err;
  if (isUserRejection(err)) {
    return new SorobanSigningError('user_rejected', 'Signing was cancelled in Freighter. No transaction was submitted.', true);
  }
  const code = extractErrorCode(err);
  return new SorobanSigningError(code, mapErrorCode(code));
}

function explorerUrlFor(hash: string): string {
  return `${EXPLORER_BASE.replace(/\/$/, '')}/tx/${hash}`;
}

export interface SignAndSubmitOptions {
  contractId: string;
  method: string;
  args?: xdr.ScVal[];
  publicKey: string;
  onProgress?: (progress: SigningProgress) => void;
}

export async function signAndSubmitTransaction({
  contractId,
  method,
  args = [],
  publicKey,
  onProgress,
}: SignAndSubmitOptions): Promise<SigningResult> {
  const report = (phase: SigningPhase) => onProgress?.({ phase, message: PHASE_MESSAGES[phase] });
  const server = new SorobanRpc.Server(RPC_URL);

  try {
    report('build');
    const account = await server.getAccount(publicKey);
    const contract = new Contract(contractId);
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(contract.call(method, ...args))
      .setTimeout(30)
      .build();

    const prepared = await server.prepareTransaction(tx);

    report('sign');
    const signedXdr = await signTransaction(prepared.toXDR(), {
      networkPassphrase: NETWORK_PASSPHRASE,
      address: publicKey,
    });

    if (!signedXdr || typeof signedXdr !== 'string') {
      throw new SorobanSigningError('user_rejected', 'Signing was cancelled in Freighter. No transaction was submitted.', true);
    }

    report('submit');
    const signedTx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE) as Transaction;
    const sendResponse = await server.sendTransaction(signedTx);

    if (sendResponse.status === 'ERROR') {
      throw new SorobanSigningError(
        extractErrorCode(sendResponse),
        mapErrorCode(extractErrorCode(sendResponse)),
      );
    }

    report('confirm');
    let getResponse = await server.getTransaction(sendResponse.hash);
    const deadline = Date.now() + 30_000;
    while (getResponse.status === SorobanRpc.Api.GetTransactionStatus.NOT_FOUND && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      getResponse = await server.getTransaction(sendResponse.hash);
    }

    if (getResponse.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
      const code = extractErrorCode(getResponse);
      throw new SorobanSigningError(code, mapErrorCode(code));
    }

    return {
      hash: sendResponse.hash,
      ledger: 'ledger' in getResponse ? getResponse.ledger : undefined,
      explorerUrl: explorerUrlFor(sendResponse.hash),
    };
  } catch (err) {
    throw toSigningError(err);
  }
}

export { mapErrorCode, explorerUrlFor, PHASE_MESSAGES };
