import { useCallback, useMemo, useState } from 'react';

export type RepaymentMode = 'partial' | 'full';

export interface LoanState {
  loanId: string;
  principal: number;
  outstandingBalance: number;
  collateralValue: number;
  healthFactor: number;
  status: 'active' | 'repaid' | 'liquidated';
}

export interface RepaymentPreview {
  mode: RepaymentMode;
  amount: number;
  remainingBalance: number;
  projectedHealthFactor: number;
  isFullRepayment: boolean;
  isValid: boolean;
  error?: string;
}

export interface RepaymentTransactionDetails {
  loanId: string;
  amount: number;
  mode: RepaymentMode;
  remainingBalance: number;
  projectedHealthFactor: number;
  asset: string;
}

export type RepaymentStatus = 'idle' | 'previewing' | 'confirming' | 'signing' | 'submitting' | 'success' | 'error';

export interface UseLoanOptions {
  loan: LoanState | null;
  asset?: string;
  /** Computes the projected health factor for a given remaining balance. */
  computeHealthFactor?: (remainingBalance: number, loan: LoanState) => number;
  /** Submits the repayment transaction (e.g. via Soroban + Freighter signing). */
  submitRepayment?: (details: RepaymentTransactionDetails) => Promise<LoanState>;
}

const DEFAULT_ASSET = 'XLM';

function defaultHealthFactor(remainingBalance: number, loan: LoanState): number {
  if (remainingBalance <= 0) return Number.POSITIVE_INFINITY;
  if (loan.outstandingBalance <= 0) return loan.healthFactor;
  const ratio = remainingBalance / loan.outstandingBalance;
  return loan.healthFactor / Math.max(ratio, Number.EPSILON);
}

export function useLoan({ loan, asset = DEFAULT_ASSET, computeHealthFactor, submitRepayment }: UseLoanOptions) {
  const [mode, setMode] = useState<RepaymentMode>('partial');
  const [amountInput, setAmountInput] = useState<string>('');
  const [status, setStatus] = useState<RepaymentStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [confirmedLoan, setConfirmedLoan] = useState<LoanState | null>(null);

  const outstandingBalance = loan?.outstandingBalance ?? 0;

  const amount = useMemo(() => {
    if (mode === 'full') return outstandingBalance;
    const parsed = Number.parseFloat(amountInput);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }, [mode, amountInput, outstandingBalance]);

  const preview = useMemo<RepaymentPreview>(() => {
    const remainingBalance = Math.max(outstandingBalance - amount, 0);
    const isFullRepayment = mode === 'full' || (amount > 0 && remainingBalance === 0);
    const hfFn = computeHealthFactor ?? defaultHealthFactor;
    const projectedHealthFactor = loan ? hfFn(remainingBalance, loan) : 0;

    let isValid = true;
    let previewError: string | undefined;
    if (!loan) {
      isValid = false;
      previewError = 'No active loan to repay.';
    } else if (amount <= 0) {
      isValid = false;
      previewError = 'Enter a repayment amount greater than zero.';
    } else if (amount > outstandingBalance) {
      isValid = false;
      previewError = 'Repayment amount exceeds outstanding balance.';
    }

    return {
      mode,
      amount,
      remainingBalance,
      projectedHealthFactor,
      isFullRepayment,
      isValid,
      error: previewError,
    };
  }, [loan, mode, amount, outstandingBalance, computeHealthFactor]);

  const setPartialAmount = useCallback((value: string) => {
    setMode('partial');
    setAmountInput(value);
    setStatus('previewing');
    setError(null);
  }, []);

  const selectRepayInFull = useCallback(() => {
    setMode('full');
    setAmountInput('');
    setStatus('previewing');
    setError(null);
  }, []);

  const transactionDetails = useMemo<RepaymentTransactionDetails | null>(() => {
    if (!loan || !preview.isValid) return null;
    return {
      loanId: loan.loanId,
      amount: preview.amount,
      mode: preview.mode,
      remainingBalance: preview.remainingBalance,
      projectedHealthFactor: preview.projectedHealthFactor,
      asset,
    };
  }, [loan, preview, asset]);

  const openConfirmation = useCallback(() => {
    if (!preview.isValid) {
      setError(preview.error ?? 'Invalid repayment amount.');
      return;
    }
    setStatus('confirming');
    setError(null);
  }, [preview]);

  const cancelConfirmation = useCallback(() => {
    setStatus('previewing');
    setError(null);
  }, []);

  const confirmRepayment = useCallback(async () => {
    if (!transactionDetails) {
      setError('Unable to build repayment transaction.');
      return;
    }
    if (!submitRepayment) {
      setError('Repayment submission is not configured.');
      setStatus('error');
      return;
    }
    try {
      setStatus('signing');
      setError(null);
      setStatus('submitting');
      const updated = await submitRepayment(transactionDetails);
      setConfirmedLoan(updated);
      setStatus('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Repayment failed.');
      setStatus('error');
    }
  }, [transactionDetails, submitRepayment]);

  const reset = useCallback(() => {
    setMode('partial');
    setAmountInput('');
    setStatus('idle');
    setError(null);
    setConfirmedLoan(null);
  }, []);

  return {
    mode,
    amountInput,
    amount,
    preview,
    transactionDetails,
    status,
    error,
    confirmedLoan,
    setPartialAmount,
    selectRepayInFull,
    openConfirmation,
    cancelConfirmation,
    confirmRepayment,
    reset,
  };
}

export default useLoan;
