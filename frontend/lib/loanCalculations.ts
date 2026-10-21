export interface LoanSimulatorInput {
  loanAmount: number;
  collateralValue: number;
}

export interface LoanSimulatorResult {
  healthFactor: number;
  ltv: number;
  monthlyInterest: number;
  liquidationThresholdAmount: number;
}

/**
 * Default protocol parameters used for client-side loan simulation.
 * These mirror the on-chain risk parameters and are intentionally
 * conservative so borrowers get a realistic estimate.
 */
export const LOAN_SIMULATOR_PARAMS = {
  /** Annual interest rate, expressed as a fraction (e.g. 0.12 = 12%). */
  annualInterestRate: 0.12,
  /** Loan-to-value at which the position becomes liquidatable. */
  liquidationThreshold: 0.8,
  /** Maximum LTV allowed when opening a position. */
  maxLtv: 0.65,
} as const;

const clampNonNegative = (value: number): number =>
  Number.isFinite(value) && value > 0 ? value : 0;

/**
 * Pure, client-side loan simulator. No API calls are made.
 *
 * - LTV = loanAmount / collateralValue
 * - Health factor = (collateralValue * liquidationThreshold) / loanAmount
 * - Monthly interest = loanAmount * annualInterestRate / 12
 * - Liquidation threshold amount = collateralValue * liquidationThreshold
 */
export function simulateLoan(
  input: LoanSimulatorInput,
  params: typeof LOAN_SIMULATOR_PARAMS = LOAN_SIMULATOR_PARAMS,
): LoanSimulatorResult {
  const loanAmount = clampNonNegative(input.loanAmount);
  const collateralValue = clampNonNegative(input.collateralValue);

  const ltv = collateralValue > 0 ? loanAmount / collateralValue : 0;

  const healthFactor =
    loanAmount > 0
      ? (collateralValue * params.liquidationThreshold) / loanAmount
      : Infinity;

  const monthlyInterest =
    (loanAmount * params.annualInterestRate) / 12;

  const liquidationThresholdAmount =
    collateralValue * params.liquidationThreshold;

  return {
    healthFactor,
    ltv,
    monthlyInterest,
    liquidationThresholdAmount,
  };
}
