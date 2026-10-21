# StellarKraal API — Endpoint Reference

This document provides a human-readable reference for all endpoints defined in
`openapi.json`. It mirrors the descriptions in the spec and is intended for
quick navigation during development and code review.

## API Versioning

All endpoints are served under a versioned base path. The current stable
version is **`/api/v1`**, which is the `servers[].url` base path declared in
`openapi.json`. Every path listed below is relative to that base path — e.g.
the health check is reachable at `/api/v1/health`.

### Version router pattern

Routes are mounted through a version router so that new versions can be added
independently without touching existing handlers:

```
/api/v1  ->  v1 router  (all routes in this document)
/api/v2  ->  v2 router  (added independently during a migration period)
```

To introduce `/api/v2`, add a new version router and mount it alongside `v1`;
both versions coexist during the migration window. Existing clients keep using
`/api/v1` unchanged.

### Unversioned requests

Requests to `/api` (without a version segment) are **not** routed to any
handler. They return `404` with a message pointing to the versioned path, e.g.:

```json
{ "error": "API version required. Use /api/v1/...", "code": "API_VERSION_REQUIRED" }
```

## Authentication (`auth`)

| Method | Path | Summary |
|--------|------|---------|
| GET | `/auth/challenge` | Get a one-time challenge |
| POST | `/auth/login` | Login with Stellar signature |
| POST | `/auth/refresh` | Rotate refresh token |

## Health (`health`)

| Method | Path | Summary |
|--------|------|---------|
| GET | `/health` | Service health check |
| GET | `/health/live` | Kubernetes liveness probe |
| GET | `/health/ready` | Kubernetes readiness probe |
| GET | `/health/deep` | Deep infrastructure health check |
| GET | `/health/{loanId}` | Get loan health factor |

## Collateral (`collateral`)

| Method | Path | Summary |
|--------|------|---------|
| POST | `/collateral/register` | Register livestock collateral (on-chain) |
| POST | `/collateral/register/batch` | Batch register livestock collateral (on-chain) |
| POST | `/collateral` | Create collateral record (DB) |
| GET | `/collateral` | List collateral records |
| GET | `/collateral/{id}` | Get collateral by ID |
| PUT | `/collateral/{id}/appraise` | Update appraised value |
| PATCH | `/collateral/{id}` | Partially update collateral fields |
| DELETE | `/collateral/{id}` | Soft-delete a collateral record |
| PATCH | `/collateral/{id}/restore` | Restore soft-deleted collateral |

### `PATCH /collateral/{id}` — Partial update

Partially updates a collateral record. Only the owner of the collateral or an
admin may patch it; other callers receive `403 Forbidden`.

**Patchable fields** (all optional, at least one required):

| Field | Type | Notes |
|-------|------|-------|
| `weight` | number | Changing this queues a new appraisal |
| `healthStatus` | string | Changing this queues a new appraisal |
| `notes` | string | Free-form health notes; does not affect appraisal |

**Behaviour**

- Returns `400 Bad Request` when the request body contains no patchable fields.
- When `weight` or `healthStatus` changes, a new appraisal is queued for the
  collateral record.
- Returns the updated collateral record on success.

## Loans (`loan`)

| Method | Path | Summary |
|--------|------|---------|
| POST | `/loan/request` | Request a new loan |
| POST | `/loan/repay` | Repay a loan |
| POST | `/loan/liquidate` | Liquidate an undercollateralised loan |
| POST | `/loan/repayment-preview` | Preview repayment breakdown |
| GET | `/loan/{id}` | Fetch a loan record |
| DELETE | `/loan/{id}` | Soft-delete a loan record |
| GET | `/loans` | List loans (paginated) |
| GET | `/loans/summary` | Get borrower loan portfolio summary |

### Idempotency (`Idempotency-Key`)

`POST /loan/repay` (and the versioned alias `POST /api/v1/loans/{id}/repay`)
accepts an optional `Idempotency-Key` request header. When supplied, the server
records the response for that key and replays it on any subsequent request that
reuses the same key, preventing duplicate repayments caused by network retries.

| Header | Required | Description |
|--------|----------|-------------|
| `Idempotency-Key` | No | Client-generated unique key (e.g. a UUID). Reusing a key returns the cached response (original status code) instead of creating a new repayment. Keys expire after 24 hours. |

## Oracle (`oracle`)

| Method | Path | Summary |
|--------|------|---------|
| POST | `/oracle/price-update` | Invalidate appraisal cache |

## Webhooks (`webhooks`)

| Method | Path | Summary |
|--------|------|---------|
| POST | `/webhooks` | Register a webhook |
| DELETE | `/webhooks/{id}` | Delete a webhook |

## Admin (`admin`)

| Method | Path | Summary |
|--------|------|---------|
| POST | `/alerts/webhook` | AWS SNS alert receiver |
| GET | `/admin/webhooks` | List registered webhooks |
| GET | `/admin/webhooks/logs` | List webhook delivery logs |
| GET | `/admin/migrations/status` | Migration status |
| GET | `/admin/deleted/collateral` | List soft-deleted collateral |
| POST | `/admin/restore/collateral/{id}` | Restore soft-deleted collateral |
| GET | `/admin/deleted/loans` | List soft-deleted loans |
| POST | `/admin/restore/loans/{id}` | Restore soft-deleted loan |
| GET | `/admin/users` | List borrowers |
| GET | `/admin/moderation-queue` | Pending-review loans |
| GET | `/admin/statistics` | Aggregate platform statistics |

## Transactions (`transactions`)

| Method | Path | Summary |
|--------|------|---------|
| GET | `/transactions` | List transactions |
| GET | `/transactions/{id}` | Get transaction by ID |
| GET | `/transactions/{hash}/status` | Poll transaction status on-chain |

## User Settings (`settings`)

| Method | Path | Summary |
|--------|------|---------|
| GET | `/settings/{wallet}` | Get user settings |
| PUT | `/settings/{wallet}` | Update user settings |

---

### Error Response Envelope

All error responses follow the `{ error, code, details? }` JSON envelope
defined by the `ErrorResponse` schema in `openapi.json`. Component-level error
responses (`ValidationError`, `Unauthorized`, `NotFound`, `RateLimited`,
`InternalError`) include example payloads for use in Swagger UI and
client SDK generation.

### Documentation Source of Truth

- **OpenAPI spec**: [`openapi.json`](../openapi.json) — `servers[].url` is
  `/api/v1`, so all paths are versioned under that base path.
- **Swagger UI**: available at the server root when `NODE_ENV !== 'production'`
- **This file**: mirrors the spec for quick reference; always validate against
  the canonical `openapi.json`.

---

## Liquidation Mechanism

This section documents how liquidation works for undercollateralised loans,
including worked numeric examples for **partial liquidation** scenarios.

### Health Factor Formula

```
healthFactor = (collateralValue × liquidationThreshold) / outstandingDebt
```

- `collateralValue` — current appraised value of the loan's collateral.
- `liquidationThreshold` — the fraction of collateral value counted toward
  coverage (e.g. `0.80`).
- `outstandingDebt` — principal + accrued interest still owed.

A loan is **liquidatable** when `healthFactor < 1.0`. A loan is **safe** when
`healthFactor >= 1.0`.

### Partial Liquidation

A partial liquidation repays only a portion of the outstanding debt in exchange
for a proportional slice of collateral plus a liquidation bonus. The protocol
caps how much debt a single liquidation may clear (`maxLiquidationRatio`, e.g.
`0.50` = up to 50% of outstanding debt per call) so that borrowers retain
collateral when possible.

**Liquidation bonus** — liquidators are compensated for taking on risk and
providing immediate liquidity. The bonus is a percentage of the debt repaid
(`liquidationBonus`, e.g. `0.05` = 5%) and is **distributed as additional
collateral** seized by the liquidator:

```
collateralSeized = debtRepaid × (1 + liquidationBonus)
```

The bonus is not minted or paid in cash — it is taken from the borrower's
collateral pool. The borrower's remaining collateral is reduced by
`collateralSeized`, and their outstanding debt is reduced by `debtRepaid`.

### Worked Examples

All examples assume `liquidationThreshold = 0.80`, `liquidationBonus = 0.05`,
and `maxLiquidationRatio = 0.50`.

#### Example 1 — Small partial liquidation

| Field | Value |
|-------|-------|
| Collateral value | 10,000 |
| Outstanding debt | 9,000 |
| Health factor | (10,000 × 0.80) / 9,000 = **0.889** (liquidatable) |

A liquidator repays **2,000** of debt:

- `collateralSeized = 2,000 × 1.05 = 2,100`
- New collateral value = 10,000 − 2,100 = **7,900**
- New outstanding debt = 9,000 − 2,000 = **7,000**
- New health factor = (7,900 × 0.80) / 7,000 = **0.903**

The loan remains liquidatable (still `< 1.0`), so further partial liquidations
are permitted.

#### Example 2 — Partial liquidation that restores health

| Field | Value |
|-------|-------|
| Collateral value | 12,000 |
| Outstanding debt | 10,000 |
| Health factor | (12,000 × 0.80) / 10,000 = **0.96** (liquidatable) |

A liquidator repays the maximum allowed (`10,000 × 0.50 = 5,000`):

- `collateralSeized = 5,000 × 1.05 = 5,250`
- New collateral value = 12,000 − 5,250 = **6,750**
- New outstanding debt = 10,000 − 5,000 = **5,000**
- New health factor = (6,750 × 0.80) / 5,000 = **1.08**

The loan is now healthy (`>= 1.0`) and cannot be re-liquidated until the health
factor drops below `1.0` again.

#### Example 3 — Capped partial liquidation (still unhealthy)

| Field | Value |
|-------|-------|
| Collateral value | 8,000 |
| Outstanding debt | 9,000 |
| Health factor | (8,000 × 0.80) / 9,000 = **0.711** (deeply liquidatable) |

A liquidator repays the maximum allowed (`9,000 × 0.50 = 4,500`):

- `collateralSeized = 4,500 × 1.05 = 4,725`
- New collateral value = 8,000 − 4,725 = **3,275**
- New outstanding debt = 9,000 − 4,500 = **4,500**
- New health factor = (3,275 × 0.80) / 4,500 = **0.582**

Because the per-call cap was hit, the loan is still liquidatable. A second
liquidation call may clear up to `4,500 × 0.50 = 2,250` more debt.

### Minimum Health Factor to Avoid Re-Liquidation

After a partial liquidation, the loan is only protected from further
liquidation once its health factor is **`>= 1.0`**. There is no separate
"buffer" threshold: any health factor below `1.0` leaves the loan open to
another liquidation call. Liquidators should size their repayment so the
resulting health factor reaches at least `1.0` (see Example 2); if the per-call
cap prevents this, multiple sequential calls are required.

### Liquidator's Guide

1. **Find liquidatable loans.** Poll `GET /health/{loanId}` (or scan
   `GET /loans`) for loans whose `healthFactor < 1.0`.
2. **Size the repayment.** Choose `debtRepaid` up to
   `outstandingDebt × maxLiquidationRatio`. To fully restore health, solve for
   the repayment that brings the post-liquidation health factor to `>= 1.0`.
3. **Preview the outcome.** Use `POST /loan/repayment-preview` to confirm the
   debt/collateral split before committing.
4. **Trigger the liquidation.** Call `POST /loan/liquidate` with the loan ID and
   the chosen `debtRepaid` amount. The endpoint repays the debt, seizes
   `debtRepaid × (1 + liquidationBonus)` of collateral, and records the
   transaction.
5. **Profit.** The liquidator's gain is the bonus portion of the seized
   collateral: `debtRepaid × liquidationBonus`. In Example 1, repaying `2,000`
   seizes `2,100` of collateral — a `100` bonus (5%). The liquidator may hold or
   sell the seized collateral to realise the profit.
6. **Verify.** Confirm the resulting health factor via `GET /health/{loanId}`
   and the recorded transaction via `GET /transactions/{hash}/status`.
