# Transaction History Feature

## Overview

The Transaction History feature provides users with a comprehensive view of all their loan-related transactions (loan requests, repayments, and liquidations). The feature includes advanced filtering, sorting, pagination, and CSV export capabilities.

## Acceptance Criteria - All Met ✓

- ✓ Table shows all transaction types with type badges
- ✓ Sortable columns: date, amount, status
- ✓ Filter by type (loan/repayment/liquidation) and date range
- ✓ Expandable rows with full transaction details
- ✓ Pagination with 20 rows per page
- ✓ Export to CSV button

## Architecture

### Backend

#### Database Schema (`src/db/store.ts`)

Added new transaction tracking with the following types:

```typescript
export type TransactionType = "loan" | "repayment" | "liquidation";
export type TransactionStatus = "pending" | "completed" | "failed";

export interface TransactionRecord {
  id: string;
  borrower: string;
  type: TransactionType;
  status: TransactionStatus;
  amount: number;
  loanId?: string;
  collateralId?: string;
  createdAt: string;
  updatedAt: string;
}
```

#### API Endpoints (`src/index.ts`)

**GET /api/transactions** - Fetch transaction history with filtering and pagination

Query Parameters:
- `page` (number, default: 1) - Page number for pagination
- `pageSize` (number, default: 20, max: 100) - Items per page
- `borrower` (string, optional) - Filter by borrower address
- `type` (string, optional) - Filter by transaction type: "loan", "repayment", or "liquidation"
- `status` (string, optional) - Filter by status: "pending", "completed", or "failed"
- `startDate` (ISO date string, optional) - Filter transactions from this date
- `endDate` (ISO date string, optional) - Filter transactions until this date

Response:
```json
{
  "data": [
    {
      "id": "tx_1234567890_abc123",
      "borrower": "GXXXXXX...",
      "type": "loan",
      "status": "completed",
      "amount": 1000,
      "loanId": "123",
      "collateralId": "456",
      "createdAt": "2026-04-27T10:30:00Z",
      "updatedAt": "2026-04-27T10:30:00Z"
    }
  ],
  "total": 42,
  "page": 1,
  "pageSize": 20
}
```

**GET /api/transactions/:id** - Get detailed transaction information

Response:
```json
{
  "id": "tx_1234567890_abc123",
  "borrower": "GXXXXXX...",
  "type": "loan",
  "status": "completed",
  "amount": 1000,
  "loanId": "123",
  "collateralId": "456",
  "createdAt": "2026-04-27T10:30:00Z",
  "updatedAt": "2026-04-27T10:30:00Z"
}
```

#### Database Functions (`src/db/store.ts`)

- `insertTransaction(data)` - Create a new transaction record
- `listTransactions(filters)` - Query transactions with filtering, sorting, and pagination
- `getTransaction(id)` - Retrieve a single transaction by ID
- `updateTransaction(id, updates)` - Update transaction status or other fields

### Frontend

#### TransactionHistory Component (`src/components/TransactionHistory.tsx`)

A fully-featured React component with:

**Features:**
- Real-time data fetching with error handling
- Multi-column filtering (type, status, date range)
- Sortable columns (date, amount, status)
- Expandable rows showing full transaction details
- Pagination with smart page navigation
- CSV export functionality
- Responsive design with Tailwind CSS
- Loading and empty states

**Props:** None (component is self-contained)

**Usage:**
```tsx
import TransactionHistory from "@/components/TransactionHistory";

export default function Dashboard() {
  return (
    <div>
      <TransactionHistory />
    </div>
  );
}
```

#### Integration

The component is integrated into the Dashboard (`src/app/dashboard/page.tsx`) and displays below the Health Factor section.

## Implementation Details

### Filtering Logic

Filters are applied server-side for efficiency:
- **Type Filter**: Exact match on transaction type
- **Status Filter**: Exact match on transaction status
- **Date Range**: Inclusive filtering using ISO date comparison
- **Borrower**: Exact match on borrower address (can be extended for current user)

### Sorting

Client-side sorting is applied after fetching to provide instant feedback:
- **Date**: Sorts by `createdAt` timestamp (default: descending)
- **Amount**: Sorts by transaction amount
- **Status**: Sorts alphabetically by status

### Pagination

- Default page size: 20 rows
- Maximum page size: 100 rows
- Smart page navigation showing up to 5 page buttons
- Previous/Next buttons with disabled state at boundaries

### CSV Export

Exports all visible transactions (respecting current filters) with columns:
- ID
- Type
- Status
- Amount
- Date
- Loan ID
- Collateral ID

File naming: `transactions_YYYY-MM-DD.csv`

## Type Safety

All types are properly defined and exported:

```typescript
// Backend types
export type TransactionType = "loan" | "repayment" | "liquidation";
export type TransactionStatus = "pending" | "completed" | "failed";
export interface TransactionRecord { ... }

// Frontend types
interface Transaction { ... }
interface PaginationData { ... }
```

## Error Handling

**Backend:**
- Validates page and pageSize parameters
- Validates date format for startDate and endDate
- Returns 400 for invalid parameters
- Returns 404 for non-existent transactions

**Frontend:**
- Displays error messages to users
- Graceful fallback for failed requests
- Loading states during data fetching
- Empty state when no transactions exist

## Performance Considerations

1. **Pagination**: Limits data transfer to 20 rows per page
2. **Filtering**: Server-side filtering reduces payload size
3. **Sorting**: Client-side sorting for instant UI feedback
4. **Caching**: Component uses React hooks for efficient re-renders
5. **Debouncing**: Filter changes reset to page 1 to avoid confusion

## Loan State Machine & On-Chain Event Mapping

This section maps every loan state transition to the Soroban contract event that emits it, so event listeners can reliably reconstruct loan state from the chain.

### Loan States

| State | Description | Possible Entry Conditions | Possible Exit Conditions |
|-------|-------------|---------------------------|--------------------------|
| `Requested` | Borrower has submitted a loan request awaiting approval/funding | `request_loan` succeeds → `LoanRequested` | Approved → `Approved`; Cancelled → `Cancelled`; Expired → `Expired` |
| `Approved` | Loan approved by lender, awaiting disbursement | `approve_loan` succeeds → `LoanApproved` | Disbursed → `Active`; Cancelled → `Cancelled` |
| `Active` | Funds disbursed, loan outstanding | `disburse_loan` succeeds → `LoanDisbursed` | Fully repaid → `Repaid`; Defaulted → `Defaulted`; Liquidated → `Liquidated` |
| `Repaid` | Loan fully repaid (terminal) | `repay_loan` reaches full amount → `LoanRepaid` | — (terminal) |
| `Defaulted` | Loan past due without full repayment | `mark_default` succeeds → `LoanDefaulted` | Liquidated → `Liquidated` |
| `Liquidated` | Collateral seized and loan closed (terminal) | `liquidate_loan` succeeds → `LoanLiquidated` | — (terminal) |
| `Cancelled` | Loan cancelled before disbursement (terminal) | `cancel_loan` succeeds → `LoanCancelled` | — (terminal) |
| `Expired` | Request expired before approval (terminal) | `expire_loan` succeeds → `LoanExpired` | — (terminal) |

### Transition → Event Mapping

| From | To | Contract Function | Soroban Event Name | Event Payload |
|------|----|-------------------|--------------------|---------------|
| — | `Requested` | `request_loan` | `LoanRequested` | `{ loan_id, borrower, amount, collateral_id, requested_at }` |
| `Requested` | `Approved` | `approve_loan` | `LoanApproved` | `{ loan_id, lender, approved_at }` |
| `Approved` | `Active` | `disburse_loan` | `LoanDisbursed` | `{ loan_id, borrower, amount, disbursed_at }` |
| `Active` | `Repaid` | `repay_loan` | `LoanRepaid` | `{ loan_id, borrower, amount, remaining, repaid_at }` |
| `Active` | `Defaulted` | `mark_default` | `LoanDefaulted` | `{ loan_id, borrower, defaulted_at }` |
| `Defaulted` | `Liquidated` | `liquidate_loan` | `LoanLiquidated` | `{ loan_id, liquidator, collateral_id, seized_amount, liquidated_at }` |
| `Requested` | `Cancelled` | `cancel_loan` | `LoanCancelled` | `{ loan_id, borrower, cancelled_at }` |
| `Approved` | `Cancelled` | `cancel_loan` | `LoanCancelled` | `{ loan_id, borrower, cancelled_at }` |
| `Requested` | `Expired` | `expire_loan` | `LoanExpired` | `{ loan_id, borrower, expired_at }` |

All events are emitted with topics `(symbol_short!("loan"), event_name, loan_id)` and the payload above as the data value, so listeners can filter by loan id.

### Invalid Transitions & Errors

| Attempted Transition | Condition | Contract Error |
|----------------------|-----------|----------------|
| `Approved` → `Active` | Loan not approved | `Error::InvalidState` |
| `Active` → `Active` | Already disbursed | `Error::InvalidState` |
| `Repaid` → any | Terminal state | `Error::InvalidState` |
| `Liquidated` → any | Terminal state | `Error::InvalidState` |
| `Cancelled` → any | Terminal state | `Error::InvalidState` |
| `Expired` → any | Terminal state | `Error::InvalidState` |
| `Active` → `Repaid` | Repayment exceeds remaining balance | `Error::Overpayment` |
| `Active` → `Defaulted` | Loan not yet past due | `Error::NotDefaulted` |
| `Defaulted` → `Liquidated` | Collateral already seized | `Error::AlreadyLiquidated` |
| any → any | Caller not authorized for transition | `Error::Unauthorized` |

Invalid transition attempts revert the transaction and emit no event; the error is returned to the caller.

### Full Lifecycle Timing Diagram

```
Borrower            Contract                 Lender              Listener
   |                   |                       |                    |
   |-- request_loan -->|                       |                    |
   |                   |-- LoanRequested ----->|                    |
   |                   |                       |                    |
   |                   |<---- approve_loan ----|                    |
   |                   |-- LoanApproved --------------------------->|
   |                   |                       |                    |
   |                   |<---- disburse_loan ---|                    |
   |                   |-- LoanDisbursed -------------------------->|
   |                   |                       |                    |
   |-- repay_loan ---->|                       |                    |
   |                   |-- LoanRepaid ----------------------------->|
   |                   |                       |                    |
```

Event order for a successful lifecycle: `LoanRequested` → `LoanApproved` → `LoanDisbursed` → `LoanRepaid`. A default path replaces the final step with `LoanDefaulted` → `LoanLiquidated`.

## Future Enhancements

1. **Real Database**: Replace in-memory store with SQLite/PostgreSQL
2. **Indexes**: Add database indexes on borrower, type, status, createdAt
3. **Webhooks**: Trigger transaction creation on blockchain events
4. **Real-time Updates**: WebSocket integration for live transaction updates
5. **Advanced Analytics**: Charts and statistics on transaction patterns
6. **Bulk Operations**: Select multiple transactions for batch actions
7. **Transaction Details Modal**: Expanded view with blockchain confirmation details
8. **Search**: Full-text search on transaction IDs and borrower addresses

## Testing

### Manual Testing Checklist

- [ ] Load dashboard and verify TransactionHistory component renders
- [ ] Test filtering by transaction type
- [ ] Test filtering by status
- [ ] Test date range filtering
- [ ] Test sorting by date (ascending/descending)
- [ ] Test sorting by amount
- [ ] Test sorting by status
- [ ] Test pagination (next/previous buttons)
- [ ] Test expandable rows show full details
- [ ] Test CSV export downloads file
- [ ] Test error handling with invalid date format
- [ ] Test empty state when no transactions exist
- [ ] Test responsive design on mobile/tablet

### API Testing

```bash
# Get all transactions
curl http://localhost:3001/api/transactions?page=1&pageSize=20

# Filter by type
curl http://localhost:3001/api/transactions?type=loan&page=1

# Filter by date range
curl http://localhost:3001/api/transactions?startDate=2026-04-01&endDate=2026-04-30

# Get specific transaction
curl http://localhost:3001/api/transactions/tx_1234567890_abc123
```

## Code Quality

- ✓ TypeScript with strict type checking
- ✓ Follows existing codebase patterns
- ✓ Proper error handling and validation
- ✓ Responsive design with Tailwind CSS
- ✓ Accessible HTML structure
- ✓ No external dependencies (removed lucide-react, using inline SVGs)
- ✓ Clean, readable code with comments

## Files Modified/Created

### Created
- `frontend/src/components/TransactionHistory.tsx` - Main component
- `TRANSACTION_HISTORY_FEATURE.md` - This documentation

### Modified
- `backend/src/db/store.ts` - Added transaction types and functions
- `backend/src/index.ts` - Added transaction API endpoints
- `frontend/src/app/dashboard/page.tsx` - Integrated TransactionHistory component
