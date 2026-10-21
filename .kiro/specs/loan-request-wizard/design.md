# Design Document: Loan Request Wizard

## Overview

The Loan Request Wizard replaces the existing `LoanForm` component on the `/borrow` page with a guided 4-step flow: Collateral Selection → Loan Amount → Review Terms → Confirm & Submit. A dedicated Zustand store owns all wizard state, ensuring data persists across back-navigation and that every step reads from a single source of truth. The wizard is rendered inline on the `/borrow` page using Next.js App Router with React 18 client components and styled with Tailwind CSS.

---

## Architecture

```mermaid
graph TD
    BorrowPage["BorrowPage (/borrow/page.tsx)"]
    WizardProvider["WizardStoreProvider (Zustand)"]
    LoanWizard["LoanWizard (orchestrator)"]
    ProgressIndicator["ProgressIndicator"]
    Step1["Step1_CollateralSelection"]
    Step2["Step2_LoanAmount"]
    Step3["Step3_ReviewTerms"]
    Step4["Step4_ConfirmSubmit"]
    API["Backend API (Express)"]
    Freighter["Freighter Wallet"]
    Stellar["Stellar Network"]

    BorrowPage --> WizardProvider
    WizardProvider --> LoanWizard
    LoanWizard --> ProgressIndicator
    LoanWizard --> Step1
    LoanWizard --> Step2
    LoanWizard --> Step3
    LoanWizard --> Step4
    Step1 --> API
    Step1 --> Freighter
    Step2 --> Step2
    Step3 --> API
    Step4 --> API
    Step4 --> Freighter
    Freighter --> Stellar
```

The `BorrowPage` wraps everything in the `WizardStoreProvider`. The `LoanWizard` component reads the current step from the store and conditionally renders the active step component alongside the `ProgressIndicator`. Each step component reads from and writes to the store via Zustand hooks — no step holds wizard data in local React state.

---

## Components and Interfaces

### WizardStore (Zustand)

```typescript
// src/store/loanWizardStore.ts

export type AnimalType = "cattle" | "goat" | "sheep";

export interface CollateralFields {
  animalType: AnimalType;
  count: string;          // string to allow controlled input; validated as integer
  appraisedValue: string; // string; validated as integer (stroops)
  collateralId: string;   // populated after successful on-chain registration
}

export interface LoanFields {
  loanAmount: string;     // string; validated as integer (stroops)
}

export interface RepaymentPreview {
  principal: number;
  interest: number;
  fees: number;
  remainingBalance: number;
  projectedHealthFactorBps: number | null;
  fullyRepaid: boolean;
}

export interface WizardState {
  currentStep: 1 | 2 | 3 | 4;
  collateral: CollateralFields;
  loan: LoanFields;
  repaymentPreview: RepaymentPreview | null;
  stepErrors: Record<number, string>;
  submitting: boolean;
  successLoanId: string | null;
}

export interface WizardActions {
  nextStep: () => void;
  prevStep: () => void;
  setCollateralField: <K extends keyof CollateralFields>(key: K, value: CollateralFields[K]) => void;
  setLoanField: <K extends keyof LoanFields>(key: K, value: LoanFields[K]) => void;
  setRepaymentPreview: (preview: RepaymentPreview) => void;
  setStepError: (step: number, message: string) => void;
  clearStepError: (step: number) => void;
  setSubmitting: (value: boolean) => void;
  setSuccessLoanId: (id: string) => void;
  reset: () => void;
}
```

The store is created with `create<WizardState & WizardActions>()(...)` from Zustand. The initial state sets `currentStep: 1`, all string fields to `""`, and `repaymentPreview: null`.

### LoanWizard (Orchestrator)

```typescript
// src/components/wizard/LoanWizard.tsx
// Props: { walletAddress: string }
// Reads currentStep from store, renders ProgressIndicator + active step
```

Renders:
- `<ProgressIndicator currentStep={currentStep} totalSteps={4} />`
- Conditionally: `<Step1_CollateralSelection />`, `<Step2_LoanAmount />`, `<Step3_ReviewTerms />`, or `<Step4_ConfirmSubmit />`

### ProgressIndicator

```typescript
// src/components/wizard/ProgressIndicator.tsx
// Props: { currentStep: number; totalSteps: number }
```

Renders a horizontal step track. Each step node is:
- **Completed** (step < currentStep): filled circle with checkmark, brown background
- **Active** (step === currentStep): filled circle, gold background, bold label
- **Upcoming** (step > currentStep): outlined circle, muted

Displays "Step N of 4" as a text label below the track.

### Step1_CollateralSelection

```typescript
// src/components/wizard/steps/Step1_CollateralSelection.tsx
// Props: { walletAddress: string }
```

- Reads/writes `collateral` fields from store
- On "Next": validates count > 0 and appraisedValue > 0 (integers)
- Calls `POST /api/collateral/register`, signs with Freighter, submits XDR
- On success: stores `collateralId`, calls `nextStep()`
- On failure: calls `setStepError(1, message)`

### Step2_LoanAmount

```typescript
// src/components/wizard/steps/Step2_LoanAmount.tsx
```

- Reads `collateral.collateralId` and `collateral.appraisedValue` from store (read-only display)
- Reads/writes `loan.loanAmount`
- Computes LTV live: `(loanAmount / appraisedValue) * 100`, shown to 2 decimal places
- On "Next": validates loanAmount > 0 and LTV ≤ 80%
- On success: calls `nextStep()`

### Step3_ReviewTerms

```typescript
// src/components/wizard/steps/Step3_ReviewTerms.tsx
```

- Displays read-only collateral + loan summary from store
- On mount (or when collateralId/loanAmount change): calls `POST /api/loan/repayment-preview`
- Shows loading spinner while fetching
- On success: calls `setRepaymentPreview(data)`, renders `<HealthGauge />` and breakdown table
- Shows liquidation warning if `projectedHealthFactorBps < 10_000`
- "Next" button enabled only when preview loaded successfully

### Step4_ConfirmSubmit

```typescript
// src/components/wizard/steps/Step4_ConfirmSubmit.tsx
// Props: { walletAddress: string }
```

- Displays full read-only summary (all fields + preview data)
- Displays estimated health factor, LTV, and origination fee before submission
- On "Submit": calls `POST /api/loan/request`, signs with Freighter, submits XDR
- Shows loading state, disables button during submission
- On success: calls `setSuccessLoanId(id)`, `reset()`
- On failure: calls `setStepError(4, message)`

---

## Data Models

### Wizard Step Flow

```
Step 1 (Collateral)  →  Step 2 (Amount)  →  Step 3 (Review)  →  Step 4 (Confirm)
     ↑ back                  ↑ back                ↑ back
```

### LTV Computation

```
LTV (%) = (loanAmount_stroops / appraisedValue_stroops) × 100
Maximum allowed LTV = 80%
```

### Validation Rules per Step

| Step | Field | Rule |
|------|-------|------|
| 1 | count | Integer > 0 |
| 1 | appraisedValue | Integer > 0 |
| 2 | loanAmount | Integer > 0 |
| 2 | LTV | ≤ 80% |

### API Contracts (existing, unchanged)

**POST /api/collateral/register**
```json
{ "owner": "GXXX...", "animal_type": "cattle", "count": 5, "appraised_value": 5000000 }
→ { "xdr": "..." }
```

**POST /api/loan/repayment-preview**
```json
{ "loan_id": 42, "amount": 1000000 }
→ { "loan_id": 42, "repayment_amount": 1050000, "breakdown": { "principal": 1000000, "interest": 40000, "fees": 10000, "remaining_balance": 0 }, "projected_health_factor_bps": 15000, "fully_repaid": true }
```

**POST /api/loan/request**
```json
{ "borrower": "GXXX...", "collateral_id": 42, "amount": 1000000 }
→ { "xdr": "..." }
```

---

## Correctness Properties

A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.

### Property 1: Step advancement requires valid inputs

*For any* wizard state where the current step's required fields are empty or invalid, calling the "Next" action SHALL NOT increment `currentStep`.

**Validates: Requirements 2.4, 3.6, 4.4, 4.5**

---

### Property 2: Back navigation preserves all field values

*For any* wizard state at step N (N > 1) with non-empty field values, calling `prevStep()` SHALL decrement `currentStep` by 1 and leave all field values in `collateral` and `loan` unchanged.

**Validates: Requirements 1.3, 2.5, 3.7**

---

### Property 3: LTV is computed consistently

*For any* positive integer `loanAmount` and `appraisedValue`, the displayed LTV SHALL equal `(loanAmount / appraisedValue) * 100` rounded to 2 decimal places.

**Validates: Requirements 3.2**

---

### Property 4: Confirm step surfaces risk metrics

*For any* loaded `repaymentPreview`, the Confirm step SHALL render the estimated health factor, LTV, and origination fee before the submit button is enabled.

**Validates: Requirements 4.6**

---

## Error Handling

- Validation errors are stored per-step in `stepErrors` and rendered inline above the step's action buttons.
- Network / wallet errors surface via `setStepError(step, message)` and do not advance the wizard.
- The submit button is disabled while `submitting` is true to prevent duplicate transactions.

---

## Testing Strategy

- Unit tests for the Zustand store cover step advancement, back-navigation persistence, and reset behavior (Properties 1, 2).
- Component tests for `Step2_LoanAmount` verify LTV computation (Property 3).
- Component tests for `Step4_ConfirmSubmit` verify health factor, LTV, and origination fee are rendered before submission (Property 4).
- Integration tests mock the backend API and Freighter to exercise the full 4-step flow.
