/**
 * HealthFactorService
 *
 * Centralizes the health factor calculation so that route handlers and
 * background jobs share a single, testable implementation.
 *
 * Formula:
 *   healthFactor = (collateralValue * liquidationThreshold) / debtValue
 *
 * Edge cases:
 *   - Zero debt: the loan is fully repaid, so there is no risk of
 *     liquidation. We return `Infinity` to represent an unbounded health
 *     factor (callers should treat this as "healthy").
 *   - Zero collateral value with outstanding debt: the loan is fully
 *     underwater. We return `0` so callers treat it as liquidatable.
 *   - Zero collateral value and zero debt: nothing is owed and nothing is
 *     locked, so we return `Infinity` (healthy / no risk).
 */
export interface HealthFactorLoan {
  collateralValue: number;
  debtValue: number;
  liquidationThreshold: number;
}

export interface HealthFactorLoanRepository {
  findById(loanId: string): Promise<HealthFactorLoan | null>;
}

export class HealthFactorService {
  constructor(private readonly loanRepository: HealthFactorLoanRepository) {}

  /**
   * Calculate the health factor for a given loan.
   *
   * @param loanId Identifier of the loan to evaluate.
   * @returns The health factor. `Infinity` when there is no debt (or no
   *          collateral and no debt); `0` when collateral is zero but debt
   *          remains.
   * @throws Error if the loan cannot be found.
   */
  async calculateHealthFactor(loanId: string): Promise<number> {
    const loan = await this.loanRepository.findById(loanId);

    if (!loan) {
      throw new Error(`Loan not found: ${loanId}`);
    }

    return HealthFactorService.computeHealthFactor(loan);
  }

  /**
   * Pure calculation helper, exposed for unit testing in isolation from
   * persistence.
   */
  static computeHealthFactor(loan: HealthFactorLoan): number {
    const { collateralValue, debtValue, liquidationThreshold } = loan;

    // No debt: nothing can be liquidated.
    if (debtValue <= 0) {
      return Infinity;
    }

    // Debt exists but collateral is worthless: fully underwater.
    if (collateralValue <= 0) {
      return 0;
    }

    return (collateralValue * liquidationThreshold) / debtValue;
  }
}
