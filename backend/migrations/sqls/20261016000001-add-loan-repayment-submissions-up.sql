-- Retains the submission guard while on-chain confirmation is asynchronous.
CREATE TABLE IF NOT EXISTS loan_repayment_submissions (
  loan_id TEXT PRIMARY KEY,
  tx_hash TEXT NOT NULL
);
