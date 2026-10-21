export type LoanStatus = 'active' | 'repaid' | 'liquidated' | 'pending';

export interface Loan {
  id: string;
  borrower: string;
  principal: number;
  outstanding: number;
  interestRate: number;
  collateral: number;
  healthFactor: number;
  status: LoanStatus;
  dueDate: string;
  createdAt: string;
}

export type RepaymentMode = 'partial' | 'full';

export interface RepaymentPreview {
  mode: RepaymentMode;
  amount: number;
  remainingBalance: number;
  currentHealthFactor: number;
  projectedHealthFactor: number;
  resultingStatus: LoanStatus;
  isValid: boolean;
  validationError?: string;
}

export interface RepaymentTransactionDetails {
  loanId: string;
  borrower: string;
  mode: RepaymentMode;
  amount: number;
  remainingBalance: number;
  projectedHealthFactor: number;
  resultingStatus: LoanStatus;
  estimatedFee?: string;
}

export interface RepaymentResult {
  loanId: string;
  mode: RepaymentMode;
  amountRepaid: number;
  remainingBalance: number;
  newHealthFactor: number;
  status: LoanStatus;
  transactionHash: string;
  confirmedAt: string;
}
