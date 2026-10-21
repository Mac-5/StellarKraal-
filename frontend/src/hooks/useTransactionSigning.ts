import { useCallback, useState } from 'react';
import { signTransaction } from '@stellar/freighter-api';
import { SorobanRpc, Transaction, TransactionBuilder } from '@stellar/stellar-sdk';

export type SigningPhase = 'idle' | 'building' | 'signing' | 'submitting' | 'success' | 'error';

export interface SigningStatus {
  phase: SigningPhase;
  message: string;
}

export interface SigningError {
  message: string;
  dismissable: boolean;
}

export interface SigningResult {
  ledgerHash: string;
  explorerUrl: string;
}

const PHASE_MESSAGES: Record<Exclude<SigningPhase, 'idle' | 'success' | 'error'>, string> = {
  building: 'Building transaction…',
  signing: 'Waiting for you to sign in Freighter…',
  submitting: 'Submitting transaction to the network…',
};

const EXPLORER_BASE = 'https://stellar.expert/explorer/testnet/tx';

/**
 * Maps common Soroban / RPC error codes and messages to user-friendly text.
 */
export function mapSorobanError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const lower = raw.toLowerCase();

  if (lower.includes('user declined') || lower.includes('rejected') || lower.includes('denied')) {
    return 'Signing was cancelled in Freighter. No transaction was submitted.';
  }
  if (lower.includes('insufficient') || lower.includes('balance')) {
    return 'Insufficient balance to cover the transaction fees.';
  }
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return 'The network took too long to respond. Please try again.';
  }
  if (lower.includes('tx_bad_seq') || lower.includes('bad seq')) {
    return 'Transaction sequence mismatch. Please refresh and try again.';
  }
  if (lower.includes('tx_insufficient_fee') || lower.includes('insufficient fee')) {
    return 'The transaction fee was too low. Please retry with a higher fee.';
  }
  if (lower.includes('op_underfunded')) {
    return 'The source account does not have enough funds for this operation.';
  }
  if (lower.includes('hosterror') || lower.includes('contract')) {
    return 'The contract rejected this transaction. Please review the details and try again.';
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return 'Unable to reach the Soroban RPC. Check your connection and try again.';
  }
  return 'Something went wrong while processing the transaction. Please try again.';
}

export interface UseTransactionSigningOptions {
  server: SorobanRpc.Server;
  networkPassphrase: string;
  publicKey: string;
}

export function useTransactionSigning({
  server,
  networkPassphrase,
  publicKey,
}: UseTransactionSigningOptions) {
  const [status, setStatus] = useState<SigningStatus>({ phase: 'idle', message: '' });
  const [error, setError] = useState<SigningError | null>(null);
  const [result, setResult] = useState<SigningResult | null>(null);

  const dismissError = useCallback(() => setError(null), []);

  const reset = useCallback(() => {
    setStatus({ phase: 'idle', message: '' });
    setError(null);
    setResult(null);
  }, []);

  const signAndSubmit = useCallback(
    async (buildTransaction: () => Promise<Transaction> | Transaction) => {
      setError(null);
      setResult(null);

      try {
        setStatus({ phase: 'building', message: PHASE_MESSAGES.building });
        const transaction = await buildTransaction();
        const prepared = await server.prepareTransaction(transaction);

        setStatus({ phase: 'signing', message: PHASE_MESSAGES.signing });
        const signedXdr = await signTransaction(prepared.toXDR(), {
          networkPassphrase,
          address: publicKey,
        });

        if (!signedXdr || typeof signedXdr !== 'string') {
          setStatus({ phase: 'error', message: '' });
          setError({
            message: 'Signing was cancelled in Freighter. No transaction was submitted.',
            dismissable: true,
          });
          return null;
        }

        setStatus({ phase: 'submitting', message: PHASE_MESSAGES.submitting });
        const signedTransaction = TransactionBuilder.fromXDR(signedXdr, networkPassphrase);
        const response = await server.sendTransaction(signedTransaction);

        if (response.status === 'ERROR') {
          throw new Error(response.errorResult?.toXDR?.('base64') ?? 'Transaction submission failed');
        }

        const ledgerHash = response.hash;
        setStatus({ phase: 'success', message: 'Transaction confirmed.' });
        const signingResult: SigningResult = {
          ledgerHash,
          explorerUrl: `${EXPLORER_BASE}/${ledgerHash}`,
        };
        setResult(signingResult);
        return signingResult;
      } catch (err) {
        setStatus({ phase: 'error', message: '' });
        setError({ message: mapSorobanError(err), dismissable: true });
        return null;
      }
    },
    [server, networkPassphrase, publicKey],
  );

  return {
    status,
    error,
    result,
    isLoading: status.phase === 'building' || status.phase === 'signing' || status.phase === 'submitting',
    signAndSubmit,
    dismissError,
    reset,
  };
}
