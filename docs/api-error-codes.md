# API Error Code Reference

All error responses from the StellarKraal API use the following JSON envelope:

```json
{
  "error": "Human-readable error message",
  "code": "MACHINE_READABLE_CODE",
  "correlationId": "uuid-for-tracing"
}
```

Rate-limit and validation errors may include additional fields (`retryAfter`, `details`). The `correlationId` is echoed from the `X-Request-ID` request header (or generated server-side) and should be included in any bug reports.

---

## HTTP Status Codes

| Status | Meaning |
|--------|---------|
| `200` | Success |
| `201` | Resource created |
| `400` | Bad request — invalid input or missing required fields |
| `401` | Unauthenticated — missing, expired, or invalid credentials |
| `403` | Forbidden — authenticated but not authorised for this resource |
| `404` | Resource not found |
| `413` | Payload Too Large — request body exceeds the 100 KB limit |
| `409` | Conflict — e.g. collateral already pledged |
| `429` | Too many requests — rate limit exceeded |
| `500` | Internal server error |
| `502` | Bad gateway — upstream RPC/contract call failed |
| `503` | Service unavailable — DB unreachable or server is shutting down |

---

## Application Error Codes

These appear in the `code` field of the response body.

### General

| Code | HTTP | Description |
|------|------|-------------|
| `INTERNAL_ERROR` | 500 | Unhandled server error. Check the `correlationId` in server logs for the stack trace. |

### Authentication & Authorisation (`/api/auth/*`)

| Code | HTTP | Description |
|------|------|-------------|
| — | 400 | `walletAddress` and `signedChallenge` (with `nonce` and `signature`) are required for login. |
| — | 401 | Challenge nonce is invalid or expired (5-minute TTL). Fetch a new challenge and retry. |
| — | 401 | Stellar ed25519 signature verification failed. |
| — | 401 | Invalid wallet address format. |
| `MISSING_TOKEN` | 400 | Refresh token cookie is absent on `POST /api/v1/auth/refresh`. |
| `INVALID_TOKEN` | 401 | Refresh token is invalid, revoked, or expired (7-day TTL by default). |
| — | 401 | JWT access token is expired (`expired`). Call `/api/v1/auth/refresh`. |
| — | 401 | JWT signature is invalid. |
| — | 401 | `Authorization: Bearer <token>` header is missing on a protected route. |
| — | 401 | API key (`sk_…`) is invalid or has been revoked. |
| — | 401 | `Authentication required` — no authenticated user on an admin route. |
| — | 403 | Forbidden — API key owner does not match the resource owner. |

### Collateral

| Code | HTTP | Description |
|------|------|-------------|
| — | 400 | Validation failed — see `details` array for field-level errors (Zod issues). |
| — | 404 | `Collateral not found` — the given collateral ID does not exist. |
| — | 400 | Collateral does not belong to the authenticated user. |
| — | 409 | Collateral is already pledged to another active loan. |

### Loans

| Code | HTTP | Description |
|------|------|-------------|
| — | 400 | Validation failed — see `details` for field-level errors. |
| — | 400 | `Idempotency-Key` header is required for repay requests. |
| — | 400 | `page` must be a positive integer. |
| — | 400 | `pageSize` must be between 1 and 100. |
| — | 404 | `Loan not found`. |

### Contract / Soroban Errors

These errors are returned when the Soroban smart contract rejects an operation. They map directly to the `Error` enum in [`contracts/stellarkraal/src/lib.rs`](../contracts/stellarkraal/src/lib.rs).

For detailed parameter definitions and invocation instructions, refer to the [StellarKraal Soroban Contract Interface](contracts/stellarkraal-interface.md).

| Numeric Code | Symbolic Name | HTTP Status | Cause / Trigger Condition | Operator Action & Resolution Steps |
|:---:|---|:---:|---|---|
| `#1` | `NotInitialized` | `502` | Operation invoked on an uninitialized contract instance. | Run the deployment script to invoke `initialize(admin, oracle, token, treasury, ltv_bps, liquidation_threshold_bps)` with valid parameters before using the protocol. |
| `#2` | `AlreadyInitialized` | `502` | `initialize` invoked more than once on an active contract. | Do not re-initialize; verify contract deployment status and state before executing initialization scripts. |
| `#3` | `Unauthorized` | `403` / `502` | Caller is not authorized for the operation (e.g. non-admin invoking admin functions, non-owner modifying collateral, or invalid pending admin acceptance). | Verify the transaction signing key. Ensure the caller address matches the configured `admin` or the resource owner. |
| `#4` | `InsufficientCollateral` | `400` | Requested loan amount exceeds the maximum allowed borrowing limit based on the configured Loan-To-Value (LTV) ratio. | Reduce requested loan principal amount, register additional livestock collateral, or wait for oracle price updates if appraisal value is outdated. |
| `#5` | `LoanNotFound` | `404` | No loan record exists for the provided `loan_id`. | Confirm the `loan_id` passed in the request matches an existing loan returned by `GET /api/v1/loans` or on-chain `get_loan`. |
| `#6` | `CollateralNotFound` | `404` | No livestock collateral record exists for the provided `collateral_id`. | Verify that the collateral was successfully registered via `register_collateral` and that the correct `collateral_id` is specified. |
| `#7` | `HealthFactorSafe` | `400` | Liquidation attempted on a position with a health factor ≥ 10,000 (safe / adequately collateralized). | Verify position health factor using `health_factor(loan_id)` before submitting liquidation transactions; only loans with `health_factor < 10000` can be liquidated. |
| `#8` | `InvalidAmount` | `400` | A numeric argument is zero, negative, out of allowed bounds (e.g. LTV > 9,000 bps, liquidation threshold < LTV, or pause duration > 30 days). | Validate input arguments against protocol limits before invoking contract functions. Ensure amounts are positive integers. |
| `#9` | `LoanAlreadyClosed` | `409` | Operation (e.g., repay or liquidate) attempted on a loan that has already been repaid or fully liquidated. | Query `get_loan(loan_id)` to verify that `status == LoanStatus::Active` prior to submitting repayments or liquidations. |
| `#10` | `InvalidFeeRate` | `400` | Configured protocol fee rate exceeds the maximum allowable limit (500 bps / 5%). | Ensure the admin fee rate parameter passed to `set_fee_rate` is between 0 and 500 basis points inclusive. |
| `#11` | `ExceedsCloseFactor` | `400` | Repayment amount in a liquidation call exceeds the allowable close-factor cap for a single liquidation transaction. | Calculate max allowable liquidation repay amount: `max_repay = (outstanding_debt * close_factor_bps) / 10000`. Adjust repay amount accordingly. |
| `#12` | `InvalidCloseFactor` | `400` | Configured close factor is outside the valid range of 1 to 10,000 bps. | Pass a close factor value between 1 and 10,000 basis points (0.01% to 100%) when invoking `set_close_factor`. |
| `#13` | `ContractPaused` | `503` | Protocol write operations (new loans, liquidations) are paused by the admin or an automated circuit breaker. | Check pause status and expiry with `is_paused_with_expiry()`. Wait for the pause window to elapse, or have the protocol administrator invoke `unpause()`. (Note: borrower repayments remain permitted during pause). |
| `#14` | `OracleAlreadyRegistered` | `409` | Attempted to register an oracle address that is already active in the oracle set. | Check registered oracles using `get_oracles()` before attempting to add a new oracle address. |
| `#15` | `OracleLimitReached` | `409` | Attempted to add an oracle when the maximum registered oracle capacity has been reached. | Remove obsolete or unresponsive oracles using `remove_oracle(admin, oracle_address)` before adding new oracle nodes. |
| `#16` | `OracleNotFound` | `404` | Specified oracle address does not exist in the registered oracle list. | Verify the target oracle address using `get_oracles()` before attempting updates or removals. |
| `#17` | `InsufficientOracleQuorum` | `502` | Insufficient number of valid, timely price submissions received from registered oracles to compute a price quorum. | Verify oracle node health and telemetry connectivity. Ensure at least `min_quorum` active oracles are submitting valid prices. |
| `#18` | `InvalidPrice` | `400` | Oracle price submission is zero, negative, exceeds deviation bounds, or fails sanity checks. | Investigate oracle feed source data for anomalies or market staleness. Ensure reported prices are valid positive numbers in the token base unit. |
| `#19` | `NotPaused` | `400` | Admin called `unpause` when the contract was not in a paused state. | Query `is_paused()` to verify current status before attempting an `unpause` operation. |
| `#20` | `AlreadyInProgress` | `409` / `502` | Reentrancy guard triggered; another state-modifying call is currently executing within the same invocation context. | Avoid reentrant invocations; ensure external calls adhere to the checks-effects-interactions pattern. |
| `#21` | `AlreadyPaused` | `400` | Admin called `pause` when the contract was already paused. | Check `is_paused()` before attempting to trigger emergency pause. |
| `#22` | `ArithmeticOverflow` | `500` / `502` | Mathematical operation exceeded integer storage bounds (e.g. timestamp overflow or compounding calculation). | Check transaction inputs and contract timestamp parameters; report unhandled overflow bugs to contract maintainers. |
| `#23` | `LiquidatorNotWhitelisted` | `403` | Liquidation attempted by an address not present on the authorized liquidator whitelist. | Request the contract admin to add the liquidator address to the whitelist using `add_liquidator(admin, liquidator_address)`. |
| `#24` | `NoUpgradePending` | `400` | `execute_upgrade` called without an active, proposed WASM upgrade hash. | Propose a new contract upgrade first using `propose_upgrade(admin, new_wasm_hash)`. |
| `#25` | `TimelockNotElapsed` | `400` | `execute_upgrade` called before the mandatory 24-hour timelock duration has elapsed. | Wait until 24 hours have passed since `propose_upgrade` was executed before attempting `execute_upgrade`. |
| `#26` | `OracleRequired` | `400` | `remove_oracle` would leave zero registered oracles while active loans remain open. | Register a replacement oracle prior to removing the current oracle, or ensure all active loans are closed/liquidated first. |

---

### Rate Limiting

| HTTP | Description |
|------|-------------|
| `429` | Too many requests. The response includes `Retry-After: 60` (seconds) and `retryAfter: 60` in the body. |

Rate limit windows are 1 minute. Default limits (all configurable via env):

| Limiter | Default | Env var |
|---------|---------|---------|
| Global | 60 req/min | `RATE_LIMIT_GLOBAL` |
| Auth routes | 10 req/min | `RATE_LIMIT_AUTH` |
| Read routes | 100 req/min | `RATE_LIMIT_READ` |
| Write routes | 10 req/min | `RATE_LIMIT_WRITE` |

See [API Rate Limits and Retry Behaviour](guides/rate-limits.md) for full details and client retry implementations.

### Infrastructure

| HTTP | Description |
|------|-------------|
| `503` | Server is shutting down — retry after a few seconds. |
| `503` | `/api/health` returns `degraded` with `db: "unreachable"` or `rpcReachable: false` when backing services are down. |

---

## Tracing Errors

Every response includes a `correlationId` (or `X-Request-ID` header on success responses). Use this value when querying logs:

```bash
# Grafana / Loki
{job="backend"} | json | correlationId="<your-id>"
```

---

## Keeping Documentation in Sync

The contract error table is synchronized with the Rust source in [`contracts/stellarkraal/src/lib.rs`](../contracts/stellarkraal/src/lib.rs) and the backend mapping in [`backend/src/utils/sorobanErrors.ts`](../backend/src/utils/sorobanErrors.ts). CI validates that all `enum Error` variants in the contract are documented in this reference.

---

## Related

- [Troubleshooting Guide](troubleshooting.md)
- [API Versioning Strategy](api-versioning-strategy.md)
- [Smart Contract Interface](contracts/stellarkraal-interface.md)
- [Rate Limits & Retry Guide](guides/rate-limits.md)
- [Soroban error source](../backend/src/utils/sorobanErrors.ts)
- [Error handler source](../backend/src/middleware/errorHandler.ts)
