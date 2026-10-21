'use client';

import { useMemo, useState } from 'react';

interface LoanSimulatorProps {
  /** Annual interest rate in percent, e.g. 12 for 12%. */
  interestRatePct?: number;
  /** Liquidation threshold in percent, e.g. 80 for 80%. */
  liquidationThresholdPct?: number;
  /** Loan-to-value ratio in percent, e.g. 75 for 75%. */
  ltvPct?: number;
  /** Optional initial loan amount. */
  initialLoanAmount?: number;
  /** Optional initial collateral value. */
  initialCollateralValue?: number;
}

const DEFAULT_INTEREST_RATE_PCT = 12;
const DEFAULT_LIQUIDATION_THRESHOLD_PCT = 80;
const DEFAULT_LTV_PCT = 75;

function parseAmount(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function formatNumber(value: number, fractionDigits = 2): string {
  if (!Number.isFinite(value)) {
    return '—';
  }
  return value.toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

export default function LoanSimulator({
  interestRatePct = DEFAULT_INTEREST_RATE_PCT,
  liquidationThresholdPct = DEFAULT_LIQUIDATION_THRESHOLD_PCT,
  ltvPct = DEFAULT_LTV_PCT,
  initialLoanAmount = 0,
  initialCollateralValue = 0,
}: LoanSimulatorProps) {
  const [loanAmount, setLoanAmount] = useState<string>(
    initialLoanAmount > 0 ? String(initialLoanAmount) : '',
  );
  const [collateralValue, setCollateralValue] = useState<string>(
    initialCollateralValue > 0 ? String(initialCollateralValue) : '',
  );

  const results = useMemo(() => {
    const loan = parseAmount(loanAmount);
    const collateral = parseAmount(collateralValue);

    const ltv = collateral > 0 ? (loan / collateral) * 100 : 0;
    const healthFactor =
      loan > 0 ? (collateral * (liquidationThresholdPct / 100)) / loan : Infinity;
    const monthlyInterest = (loan * (interestRatePct / 100)) / 12;
    const liquidationThresholdAmount = collateral * (liquidationThresholdPct / 100);

    return {
      ltv,
      healthFactor,
      monthlyInterest,
      liquidationThresholdAmount,
      exceedsLtv: ltv > ltvPct,
    };
  }, [loanAmount, collateralValue, interestRatePct, liquidationThresholdPct, ltvPct]);

  const healthFactorDisplay = Number.isFinite(results.healthFactor)
    ? formatNumber(results.healthFactor)
    : '—';

  return (
    <section
      aria-labelledby="loan-simulator-heading"
      className="rounded-lg border border-gray-200 p-4"
    >
      <h2 id="loan-simulator-heading" className="mb-4 text-lg font-semibold">
        Loan Simulator
      </h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="simulator-loan-amount" className="mb-1 block text-sm font-medium">
            Loan amount
          </label>
          <input
            id="simulator-loan-amount"
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            value={loanAmount}
            onChange={(event) => setLoanAmount(event.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2"
            aria-describedby="simulator-loan-amount-help"
          />
          <p id="simulator-loan-amount-help" className="mt-1 text-xs text-gray-500">
            Amount you want to borrow.
          </p>
        </div>

        <div>
          <label htmlFor="simulator-collateral-value" className="mb-1 block text-sm font-medium">
            Collateral value
          </label>
          <input
            id="simulator-collateral-value"
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            value={collateralValue}
            onChange={(event) => setCollateralValue(event.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2"
            aria-describedby="simulator-collateral-value-help"
          />
          <p id="simulator-collateral-value-help" className="mt-1 text-xs text-gray-500">
            Total value of the collateral you will provide.
          </p>
        </div>
      </div>

      <dl className="mt-6 grid gap-4 sm:grid-cols-2" aria-live="polite">
        <div>
          <dt className="text-sm text-gray-500">Health factor</dt>
          <dd className="text-lg font-semibold" aria-label="Estimated health factor">
            {healthFactorDisplay}
          </dd>
        </div>

        <div>
          <dt className="text-sm text-gray-500">LTV</dt>
          <dd
            className={`text-lg font-semibold ${results.exceedsLtv ? 'text-red-600' : ''}`}
            aria-label="Loan-to-value percentage"
          >
            {formatNumber(results.ltv)}%
            {results.exceedsLtv ? (
              <span className="ml-2 text-xs font-normal text-red-600">
                Exceeds max {formatNumber(ltvPct, 0)}%
              </span>
            ) : null}
          </dd>
        </div>

        <div>
          <dt className="text-sm text-gray-500">Monthly interest</dt>
          <dd className="text-lg font-semibold" aria-label="Estimated monthly interest">
            {formatNumber(results.monthlyInterest)}
          </dd>
        </div>

        <div>
          <dt className="text-sm text-gray-500">Liquidation threshold amount</dt>
          <dd
            className="text-lg font-semibold"
            aria-label="Collateral value at liquidation threshold"
          >
            {formatNumber(results.liquidationThresholdAmount)}
          </dd>
        </div>
      </dl>
    </section>
  );
}
