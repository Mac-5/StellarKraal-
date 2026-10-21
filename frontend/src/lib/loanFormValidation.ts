/**
 * Validation rules and limits for the loan and collateral forms — Issue #1417.
 * Messages say exactly what to enter so users can fix the field without guessing.
 */

/* Field limits — shared by validators and helper text so they never drift apart. */
export const LIMITS = {
  countMin: 1,
  countMax: 10_000,
  appraisedMin: 1,
  loanMin: 1_000,
} as const;

export const fmt = (n: number) => n.toLocaleString('en-US');

export function validateCount(v: string): string | null {
  if (!v.trim()) return 'Enter how many animals you are registering.';
  const n = Number(v);
  if (!Number.isInteger(n)) return 'Enter a whole number of animals (no decimals).';
  if (n < LIMITS.countMin || n > LIMITS.countMax)
    return `Enter a count between ${fmt(LIMITS.countMin)} and ${fmt(LIMITS.countMax)}.`;
  return null;
}

export function validateAppraisedValue(v: string): string | null {
  if (!v.trim()) return 'Enter the appraised value in stroops.';
  const n = Number(v);
  if (!Number.isFinite(n)) return 'Enter the appraised value using digits only.';
  if (!Number.isInteger(n)) return 'Enter a whole number of stroops (1 XLM = 10,000,000 stroops).';
  if (n < LIMITS.appraisedMin) return 'Enter an appraised value greater than 0 stroops.';
  return null;
}

export function validateCollateralId(v: string): string | null {
  if (!v.trim()) return 'Enter the collateral ID from your registration.';
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1)
    return 'Enter a collateral ID as a positive whole number (e.g. 42).';
  return null;
}

export function validateLoanAmount(v: string): string | null {
  if (!v.trim()) return 'Enter how much you want to borrow, in stroops.';
  const n = Number(v);
  if (!Number.isFinite(n)) return 'Enter the loan amount using digits only.';
  if (!Number.isInteger(n)) return 'Enter a whole number of stroops (1 XLM = 10,000,000 stroops).';
  if (n < LIMITS.loanMin) return `Enter a loan amount of at least ${fmt(LIMITS.loanMin)} stroops.`;
  return null;
}
