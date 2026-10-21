import { useCallback, useMemo, useState } from 'react';
import { signTransaction } from '@stellar/freighter-api';
import { SorobanRpc, Transaction, TransactionBuilder } from '@stellar/stellar-sdk';

type SignPhase = 'idle' | 'building' | 'signing' | 'submitting' | 'success' | 'error';

interface TransactionSignerProps {
  rpcUrl: string;
  networkPassphrase: string;
  buildTransaction: () => Promise<Transaction>;
  onSuccess?: (hash: string) => void;
}

const PHASE_MESSAGES: Record<Exclude<SignPhase, 'idle' | 'success' | 'error'>, string> = {
  building: 'Building transaction…',
  signing: 'Waiting for you to sign in Freighter…',
  submitting: 'Submitting transaction to the network…',
};

const EXPLORER_BASE: Record<string, string> = {
  'Test SDF Network ; September 2015': 'https://stellar.expert/explorer/testnet/tx/',
  'Public Global Stellar Network ; September 2015': 'https://stellar.expert/explorer/public/tx/',
};

function mapSorobanError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();

  if (lower.includes('user declined') || lower.includes('rejected') || lower.includes('denied')) {
    return 'Signing was cancelled in Freighter. No transaction was submitted.';
  }
  if (lower.includes('insufficient') || lower.includes('balance')) {
    return 'Insufficient balance to cover the transaction fees or amount.';
  }
  if (lower.includes('tx_bad_seq') || lower.includes('bad seq')) {
    return 'Transaction sequence number is out of date. Please refresh and try again.';
  }
  if (lower.includes('tx_insufficient_fee') || lower.includes('insufficient fee')) {
    return 'The network fee was too low. Please retry the transaction.';
  }
  if (lower.includes('tx_too_late') || lower.includes('timeout') || lower.includes('timed out')) {
    return 'The transaction expired before it could be confirmed. Please try again.';
  }
  if (lower.includes('op_underfunded')) {
    return 'The source account does not have enough funds for this operation.';
  }
  if (lower.includes('contract') && lower.includes('error')) {
    return 'The Soroban contract rejected this transaction. Check the inputs and try again.';
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return 'Could not reach the Soroban RPC. Check your connection and try again.';
  }
  return 'Something went wrong while processing the transaction. Please try again.';
}

export default function TransactionSigner({
  rpcUrl,
  networkPassphrase,
  buildTransaction,
  onSuccess,
}: TransactionSignerProps) {
  const [phase, setPhase] = useState<SignPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const explorerUrl = useMemo(() => {
    if (!txHash) return null;
    const base = EXPLORER_BASE[networkPassphrase];
    return base ? `${base}${txHash}` : null;
  }, [txHash, networkPassphrase]);

  const isBusy = phase === 'building' || phase === 'signing' || phase === 'submitting';

  const handleSign = useCallback(async () => {
    setError(null);
    setTxHash(null);
    try {
      setPhase('building');
      const tx = await buildTransaction();

      setPhase('signing');
      const signedXdr = await signTransaction(tx.toXDR(), {
        networkPassphrase,
      });

      setPhase('submitting');
      const server = new SorobanRpc.Server(rpcUrl);
      const signedTx = TransactionBuilder.fromXDR(signedXdr, networkPassphrase);
      const response = await server.sendTransaction(signedTx);

      if (response.status === 'ERROR') {
        throw new Error(response.errorResult?.toXDR('base64') ?? 'Transaction submission failed');
      }

      setTxHash(response.hash);
      setPhase('success');
      onSuccess?.(response.hash);
    } catch (err) {
      setError(mapSorobanError(err));
      setPhase('error');
    }
  }, [buildTransaction, networkPassphrase, rpcUrl, onSuccess]);

  return (
    <div className="transaction-signer">
      {isBusy && (
        <div className="signer-loading" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <span>{PHASE_MESSAGES[phase as keyof typeof PHASE_MESSAGES]}</span>
        </div>
      )}

      {error && (
        <div className="alert alert-error" role="alert">
          <span>{error}</span>
          <button
            type="button"
            className="alert-dismiss"
            aria-label="Dismiss error"
            onClick={() => {
              setError(null);
              setPhase('idle');
            }}
          >
            ×
          </button>
        </div>
      )}

      {phase === 'success' && txHash && (
        <div className="signer-confirmation" role="status">
          <p>Transaction confirmed.</p>
          <p className="tx-hash">
            Ledger hash: <code>{txHash}</code>
          </p>
          {explorerUrl && (
            <a href={explorerUrl} target="_blank" rel="noopener noreferrer">
              View on Stellar Expert
            </a>
          )}
        </div>
      )}

      <button type="button" onClick={handleSign} disabled={isBusy}>
        {isBusy ? 'Processing…' : 'Sign Transaction'}
      </button>
    </div>
  );
}
