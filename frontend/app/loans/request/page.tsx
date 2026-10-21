"use client";

import { useMemo, useState } from "react";

const LIQUIDATION_THRESHOLD = 0.8;
const ANNUAL_INTEREST_RATE = 0.12;

export default function LoanRequestPage() {
  const [loanAmount, setLoanAmount] = useState("");
  const [collateralValue, setCollateralValue] = useState("");

  const simulation = useMemo(() => {
    const loan = Number.parseFloat(loanAmount);
    const collateral = Number.parseFloat(collateralValue);

    if (!Number.isFinite(loan) || !Number.isFinite(collateral) || collateral <= 0) {
      return null;
    }

    const ltv = (loan / collateral) * 100;
    const healthFactor = (collateral * LIQUIDATION_THRESHOLD) / loan;
    const monthlyInterest = (loan * ANNUAL_INTEREST_RATE) / 12;
    const liquidationThresholdAmount = collateral * LIQUIDATION_THRESHOLD;

    return { ltv, healthFactor, monthlyInterest, liquidationThresholdAmount };
  }, [loanAmount, collateralValue]);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Request a Loan</h1>
      <p className="mt-2 text-sm text-gray-600">
        Simulate different loan amounts before submitting your request.
      </p>

      <section className="mt-6 rounded-lg border p-4" aria-labelledby="simulator-heading">
        <h2 id="simulator-heading" className="text-lg font-medium">
          Loan Simulator
        </h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="loan-amount" className="block text-sm font-medium">
              Loan amount
            </label>
            <input
              id="loan-amount"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={loanAmount}
              onChange={(e) => setLoanAmount(e.target.value)}
              className="mt-1 w-full rounded border px-3 py-2"
              aria-describedby="simulator-output"
            />
          </div>

          <div>
            <label htmlFor="collateral-value" className="block text-sm font-medium">
              Collateral value
            </label>
            <input
              id="collateral-value"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={collateralValue}
              onChange={(e) => setCollateralValue(e.target.value)}
              className="mt-1 w-full rounded border px-3 py-2"
              aria-describedby="simulator-output"
            />
          </div>
        </div>

        <dl id="simulator-output" aria-live="polite" className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-gray-600">Health factor</dt>
            <dd className="text-lg font-semibold">
              {simulation ? simulation.healthFactor.toFixed(2) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-gray-600">LTV</dt>
            <dd className="text-lg font-semibold">
              {simulation ? `${simulation.ltv.toFixed(2)}%` : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-gray-600">Monthly interest</dt>
            <dd className="text-lg font-semibold">
              {simulation ? simulation.monthlyInterest.toFixed(2) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-gray-600">Liquidation threshold amount</dt>
            <dd className="text-lg font-semibold">
              {simulation ? simulation.liquidationThresholdAmount.toFixed(2) : "—"}
            </dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
