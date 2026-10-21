# Webhook Payload Reference

StellarKraal emits HTTP webhook callbacks whenever a loan changes state. This
guide documents the exact JSON shape for each event type, how to verify
delivery signatures, and how to decrypt encrypted payloads.

For architectural context — including registration endpoints, retry strategy,
and security model — see [ADR-008: Webhook-Based Event Delivery](../adr/ADR-008-webhooks.md).

---

## Envelope

Every webhook delivery is an HTTP `POST` with `Content-Type: application/json`.
The body always uses the following top-level envelope:

```json
{
  "event": "<event-type>",
  "payload": { ... },
  "timestamp": 1690000000000
}
```

| Field | Type | Description |
|-------|------|-------------|
| `event` | `string` | Event type identifier (see [Event types](#event-types)). |
| `payload` | `object` | Event-specific data (see per-event schemas below). |
| `timestamp` | `number` | Unix epoch **milliseconds** when the event was generated on the server. |

For webhooks registered with `encrypt: true`, the body uses a different
structure — see [Encrypted delivery](#encrypted-delivery).

---

## Event types

The loan lifecycle is covered by five event types:

| Event | Fired when |
|-------|------------|
| `loan.created` | A loan request is built and submitted to the Soroban contract. |
| `loan.active` | The on-chain `loan_activated` event is confirmed on a ledger. |
| `loan.at_risk` | The loan's health factor drops below the liquidation threshold. |
| `loan.repaid` | A repayment transaction is built and submitted. |
| `loan.liquidated` | A liquidation transaction is built and submitted. |

### `loan.created`

Fired when a loan request transaction is built (in `loanService.requestLoan()`),
immediately before submission to the Soroban contract.

**JSON Schema**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "loan.created payload",
  "type": "object",
  "required": ["borrower", "collateral_ids", "amount"],
  "additionalProperties": false,
  "properties": {
    "borrower": {
      "type": "string",
      "description": "Stellar public key (G...) of the borrowing account.",
      "pattern": "^G[A-Z2-7]{55}$"
    },
    "collateral_ids": {
      "type": "array",
      "description": "IDs of the collateral records pledged for this loan.",
      "items": { "type": "integer", "minimum": 0 },
      "minItems": 1
    },
    "amount": {
      "type": "integer",
      "description": "Loan amount in stroops (1 XLM = 10,000,000 stroops).",
      "minimum": 1
    }
  }
}
```

**Example payload**

```json
{
  "event": "loan.created",
  "payload": {
    "borrower": "GAHJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBV3TMVSWN7KV",
    "collateral_ids": [12, 17],
    "amount": 5000000000
  },
  "timestamp": 1690000000000
}
```

---

### `loan.active`

Fired by the contract event listener when the on-chain `loan_activated` event
is confirmed on Stellar. This event arrives **after** `loan.created` once the
Soroban transaction is included in a ledger.

**JSON Schema**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "loan.active payload",
  "type": "object",
  "required": ["loanId", "borrower", "amount", "timestamp"],
  "additionalProperties": false,
  "properties": {
    "loanId": {
      "type": "string",
      "description": "On-chain loan identifier as returned by the Soroban contract."
    },
    "borrower": {
      "type": "string",
      "description": "Stellar public key of the borrower.",
      "pattern": "^G[A-Z2-7]{55}$"
    },
    "amount": {
      "type": "integer",
      "description": "Activated loan amount in stroops.",
      "minimum": 1
    },
    "timestamp": {
      "type": "integer",
      "description": "Ledger close time as Unix epoch milliseconds."
    }
  }
}
```

**Example payload**

```json
{
  "event": "loan.active",
  "payload": {
    "loanId": "loan-78a3f2",
    "borrower": "GAHJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBV3TMVSWN7KV",
    "amount": 5000000000,
    "timestamp": 1690000120000
  },
  "timestamp": 1690000121500
}
```

> **Note:** `payload.timestamp` is the ledger close time; the top-level
> `timestamp` is when the webhook delivery was generated (slightly later).

---

### `loan.at_risk`

Fired by the risk monitor when a loan's health factor falls below the
liquidation threshold, giving integrators a chance to notify borrowers before
liquidation occurs.

**JSON Schema**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "loan.at_risk payload",
  "type": "object",
  "required": ["loan_id", "borrower", "health_factor", "threshold"],
  "additionalProperties": false,
  "properties": {
    "loan_id": {
      "type": "integer",
      "description": "Database ID of the loan at risk.",
      "minimum": 0
    },
    "borrower": {
      "type": "string",
      "description": "Stellar public key of the borrower.",
      "pattern": "^G[A-Z2-7]{55}$"
    },
    "health_factor": {
      "type": "number",
      "description": "Current health factor (collateral value / debt value).",
      "minimum": 0
    },
    "threshold": {
      "type": "number",
      "description": "Liquidation threshold the health factor crossed below.",
      "minimum": 0
    }
  }
}
```

**Example payload**

```json
{
  "event": "loan.at_risk",
  "payload": {
    "loan_id": 42,
    "borrower": "GAHJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBV3TMVSWN7KV",
    "health_factor": 1.08,
    "threshold": 1.1
  },
  "timestamp": 1690005400000
}
```

---

### `loan.repaid`

Fired when a repayment transaction is built (in `loanService.repayLoan()`).

**JSON Schema**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "loan.repaid payload",
  "type": "object",
  "required": ["borrower", "loan_id", "amount"],
  "additionalProperties": false,
  "properties": {
    "borrower": {
      "type": "string",
      "description": "Stellar public key of the account repaying the loan.",
      "pattern": "^G[A-Z2-7]{55}$"
    },
    "loan_id": {
      "type": "integer",
      "description": "Database ID of the loan being repaid.",
      "minimum": 0
    },
    "amount": {
      "type": "integer",
      "description": "Repayment amount in stroops.",
      "minimum": 1
    }
  }
}
```

**Example payload**

```json
{
  "event": "loan.repaid",
  "payload": {
    "borrower": "GAHJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBV3TMVSWN7KV",
    "loan_id": 42,
    "amount": 5000000000
  },
  "timestamp": 1690003600000
}
```

---

### `loan.liquidated`

Fired when a liquidation transaction is built (in `loanService.liquidateLoan()`).

**JSON Schema**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "loan.liquidated payload",
  "type": "object",
  "required": ["liquidator", "loan_id", "repay_amount"],
  "additionalProperties": false,
  "properties": {
    "liquidator": {
      "type": "string",
      "description": "Stellar public key of the account performing the liquidation.",
      "pattern": "^G[A-Z2-7]{55}$"
    },
    "loan_id": {
      "type": "integer",
      "description": "Database ID of the liquidated loan.",
      "minimum": 0
    },
    "repay_amount": {
      "type": "integer",
      "description": "Amount repaid during liquidation in stroops.",
      "minimum": 1
    }
  }
}
```

**Example payload**

```json
{
  "event": "loan.liquidated",
  "payload": {
    "liquidator": "GBVZQ4TBTSNKZXJD5CKAHVTQNTLFKBHXNZENAPQVMQPF36KZOLKIIG4A",
    "loan_id": 42,
    "repay_amount": 4800000000
  },
  "timestamp": 1690007200000
}
```

---

## Signature verification

Every delivery includes an `X-StellarKraal-Signature` header:

```
X-StellarKraal-Signature: sha256=<hex>
```

The signature is HMAC-SHA256 of the **raw request body** (the JSON bytes as
received over the wire) using the per-webhook secret that was returned at
registration time.

### Verification steps

1. Read the raw request body as bytes — do **not** parse JSON first.
2. Compute `sha256=` + HMAC-SHA256 hex of the raw body using your webhook secret.
3. Compare using a **timing-safe equality function** to prevent timing attacks.
4. Reject the request if the signatures do not match.

### Node.js example

```js
import crypto from 'node:crypto';

/**
 * Verify the HMAC-SHA256 signature of an incoming webhook delivery.
 *
 * @param {Buffer} rawBody   - Raw request body (bytes, not parsed JSON).
 * @param {string} signature - Value of the X-StellarKraal-Signature header.
 * @param {string} secret    - Webhook secret returned at registration time.
 * @returns {boolean}        - true if the signature is valid.
 */
function verifySignature(rawBody, signature, secret) {
  if (!signature || !signature.startsWith('sha256=')) {
    // Missing or malformed header — reject immediately.
    return false;
  }

  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(rawBody)          // Buffer or string — must be the raw bytes
    .digest('hex');

  // Use timingSafeEqual to prevent timing side-channel attacks.
  // Both buffers must be the same length; if they differ the signature is
  // already invalid, but we still do the comparison to avoid leaking length
  // information via a short-circuit.
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);

  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
```

### Python example

```python
import hmac
import hashlib


def verify_signature(raw_body: bytes, signature: str, secret: str) -> bool:
    """Verify the HMAC-SHA256 signature of an incoming webhook delivery."""
    if not signature or not signature.startswith("sha256="):
        return False

    expected = "sha256=" + hmac.new(
        secret.encode("utf-8"), raw_body, hashlib.sha256
    ).hexdigest()

    # compare_digest is timing-safe.
    return hmac.compare_digest(signature, expected)
```

---

## Retry behaviour, backoff, and idempotency

Webhook deliveries are **at-least-once**. A delivery is considered successful
when your endpoint responds with a `2xx` status within the timeout window
(10 seconds). Any other response — or a network error — triggers a retry.

### Exponential backoff

Failed deliveries are retried with exponential backoff. The delay before
attempt _n_ is `base * 2^(n-1)` seconds, capped at the maximum interval:

| Attempt | Delay before retry |
|---------|--------------------|
| 1 | immediate |
| 2 | 30 s |
| 3 | 1 min |
| 4 | 2 min |
| 5 | 4 min |
| 6 | 8 min |
| 7 | 16 min |
| 8 | 32 min (final) |

After the final attempt the delivery is marked as failed and surfaced in the
dashboard. Retries are scheduled independently per delivery, so a slow endpoint
for one event does not block others.

### Idempotency keys

Because deliveries are at-least-once, the same event may arrive more than once
(for example, if your endpoint processed the event but the `2xx` response was
lost). Every delivery carries a stable idempotency key in the
`X-StellarKraal-Idempotency-Key` header:

```
X-StellarKraal-Idempotency-Key: 8f14e45fceea167a5a36dedd4bea2543
```

The key is derived from the event type and the underlying record, so retries of
the same event reuse the same key. Consumers should:

1. Record the idempotency key before applying side effects (e.g. in a unique
   column or a short-lived cache).
2. Skip processing if the key has already been seen.
3. Return `2xx` for duplicates so the sender stops retrying.

```js
const seen = new Set();

function handleDelivery(req, res) {
  const key = req.headers['x-stellarkraal-idempotency-key'];
  if (seen.has(key)) {
    // Already processed — acknowledge without re-applying side effects.
    return res.status(200).end();
  }

  // ... verify signature, then apply side effects ...
  seen.add(key);
  res.status(200).end();
}
```
