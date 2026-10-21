import { useMemo, useState } from 'react';
import { useContractError } from '../hooks/useContractError';

interface RepayModalProps {
  isOpen: boolean;
  onClose: () => void;
  outstandingBalance: number;
  currentHealthFactor: number;
  collateralValue: number;
  onRepay: (amount: number) => Promise<{ healthFactor: number; remainingBalance: number }>;
}

type RepayStep = 'form' | 'confirm' | 'success';

const formatAmount = (value: number): string =>
  Number.isFinite(value) ? value.toFixed(2) : '0.00';

const formatHealthFactor = (value: number): string =>
  Number.isFinite(value) ? value.toFixed(2) : '\u221e';

const computeHealthFactor = (
  collateralValue: number,
  remainingBalance: number,
): number => {
  if (remainingBalance <= 0) return Infinity;
  return collateralValue / remainingBalance;
};

export default function RepayModal({
  isOpen,
  onClose,
  outstandingBalance,
  currentHealthFactor,
  collateralValue,
  onRepay,
}: RepayModalProps) {
  const [step, setStep] = useState<RepayStep>('form');
  const [amountInput, setAmountInput] = useState('');
  const [isFullRepay, setIsFullRepay] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{ healthFactor: number; remainingBalance: number } | null>(null);
  const { error, handleError, clearError } = useContractError();

  const proposedAmount = useMemo(() => {
    if (isFullRepay) return outstandingBalance;
    const parsed = parseFloat(amountInput);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }, [amountInput, isFullRepay, outstandingBalance]);

  const remainingBalance = Math.max(outstandingBalance - proposedAmount, 0);
  const projectedHealthFactor = computeHealthFactor(collateralValue, remainingBalance);
  const isAmountValid = proposedAmount > 0 && proposedAmount <= outstandingBalance;

  const resetState = () => {
    setStep('form');
    setAmountInput('');
    setIsFullRepay(false);
    setIsSubmitting(false);
    setResult(null);
    clearError();
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleSelectFull = () => {
    setIsFullRepay(true);
    setAmountInput(outstandingBalance.toString());
  };

  const handleAmountChange = (value: string) => {
    setIsFullRepay(false);
    setAmountInput(value);
  };

  const handleReview = () => {
    if (!isAmountValid) return;
    clearError();
    setStep('confirm');
  };

  const handleConfirm = async () => {
    if (!isAmountValid) return;
    setIsSubmitting(true);
    clearError();
    try {
      const response = await onRepay(proposedAmount);
      setResult(response);
      setStep('success');
    } catch (err) {
      handleError(err);
      setStep('form');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Repay Loan</h2>
          <button
            type="button"
            onClick={handleClose}
            className="text-gray-500 hover:text-gray-700"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            {error.message}
          </div>
        )}

        {step === 'form' && (
          <div className="space-y-4">
            <div>
              <label htmlFor="repay-amount" className="mb-1 block text-sm font-medium text-gray-700">
                Repayment amount
              </label>
              <input
                id="repay-amount"
                type="number"
                min="0"
                step="any"
                value={amountInput}
                onChange={(e) => handleAmountChange(e.target.value)}
                placeholder="0.00"
                className="w-full rounded border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleSelectFull}
                className="mt-2 text-sm font-medium text-blue-600 hover:text-blue-800"
              >
                Repay in Full ({formatAmount(outstandingBalance)})
              </button>
            </div>

            <div className="rounded bg-gray-50 p-3 text-sm">
              <div className="flex justify-between py-1">
                <span className="text-gray-600">Outstanding balance</span>
                <span className="font-medium">{formatAmount(outstandingBalance)}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-gray-600">Remaining after repayment</span>
                <span className="font-medium">{formatAmount(remainingBalance)}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-gray-600">Current health factor</span>
                <span className="font-medium">{formatHealthFactor(currentHealthFactor)}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-gray-600">Projected health factor</span>
                <span className="font-medium text-green-600">
                  {formatHealthFactor(projectedHealthFactor)}
                </span>
              </div>
            </div>

            {!isAmountValid && proposedAmount > outstandingBalance && (
              <p className="text-sm text-red-600">Amount exceeds outstanding balance.</p>
            )}

            <button
              type="button"
              onClick={handleReview}
              disabled={!isAmountValid}
              className="w-full rounded bg-blue-600 py-2 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Review Repayment
            </button>
          </div>
        )}

        {step === 'confirm' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Review the transaction details below. You will be asked to sign with Freighter.
            </p>
            <div className="rounded bg-gray-50 p-3 text-sm">
              <div className="flex justify-between py-1">
                <span className="text-gray-600">Repayment type</span>
                <span className="font-medium">{isFullRepay ? 'Full repayment' : 'Partial repayment'}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-gray-600">Amount</span>
                <span className="font-medium">{formatAmount(proposedAmount)}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-gray-600">Remaining balance</span>
                <span className="font-medium">{formatAmount(remainingBalance)}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-gray-600">Projected health factor</span>
                <span className="font-medium text-green-600">
                  {formatHealthFactor(projectedHealthFactor)}
                </span>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep('form')}
                disabled={isSubmitting}
                className="flex-1 rounded border border-gray-300 py-2 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isSubmitting}
                className="flex-1 rounded bg-blue-600 py-2 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? 'Signing\u2026' : 'Confirm & Sign'}
              </button>
            </div>
          </div>
        )}

        {step === 'success' && result && (
          <div className="space-y-4">
            <div className="rounded border border-green-300 bg-green-50 p-3 text-sm text-green-700">
              Repayment confirmed on-chain.
            </div>
            <div className="rounded bg-gray-50 p-3 text-sm">
              <div className="flex justify-between py-1">
                <span className="text-gray-600">Loan status</span>
                <span className="font-medium">
                  {result.remainingBalance <= 0 ? 'Repaid' : 'Active'}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-gray-600">Remaining balance</span>
                <span className="font-medium">{formatAmount(result.remainingBalance)}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-gray-600">New health factor</span>
                <span className="font-medium text-green-600">
                  {formatHealthFactor(result.healthFactor)}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="w-full rounded bg-blue-600 py-2 font-medium text-white hover:bg-blue-700"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
