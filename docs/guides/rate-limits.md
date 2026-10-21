# API Rate Limits and Retry Behaviour

StellarKraal's backend protects its API and Soroban smart contract RPC endpoints from abuse, denial of service, and traffic spikes using [`express-rate-limit`](https://github.com/express-rate-limit/express-rate-limit). Rate limits are enforced **per client IP** across several functional tiers. Every HTTP request passes through the **global** limiter first; sensitive authentication and write routes apply additional, stricter limits.

Implementation: `backend/src/middleware/rateLimit.ts`, mounted in `backend/src/index.ts` and `backend/src/routes/v1.ts`.

---

## Rate Limit Tiers

| Tier | Limiter | Default Limit | Sliding Window | Configurable via Env |
|------|---------|---------------|----------------|----------------------|
| **Global** | `globalLimiter` | 60 req / min | 60 seconds | `RATE_LIMIT_GLOBAL` |
| **Auth** | `authLimiter` | 10 req / min | 60 seconds | `RATE_LIMIT_AUTH` (default: `10`) |
| **Read** | `readLimiter` | 100 req / min | 60 seconds | `RATE_LIMIT_READ` (default: `100`) |
| **Write** | `writeLimiter` | 10 req / min | 60 seconds | `RATE_LIMIT_WRITE` (default: `10`) |

### Tier Breakdown & Endpoints

1. **Global Tier (`globalLimiter`)**
   - Applies to all HTTP routes on the application, including `/metrics`, `/api/*`, `/api/v1/*`, and `/api/docs`.
   - Default: `60` requests per minute per IP.

2. **Auth Tier (`authLimiter`)**
   - Protects cryptographic challenge generation, signature verification, and JWT issuance:
     - `GET /api/auth/challenge`
     - `POST /api/auth/login`
     - `POST /api/auth/refresh`
   - Default: `10` requests per minute per IP.

3. **Read Tier (`readLimiter`)**
   - Protects standard data retrieval endpoints under `/api/v1`:
     - `GET /api/v1/health`
     - `GET /api/v1/loan/:id`
     - `GET /api/v1/health/:loanId`
     - `GET /api/v1/loans`
     - `GET /api/v1/collateral/:id`
     - `GET /api/v1/settings/:wallet`
     - `GET /api/v1/admin/webhooks`
     - `GET /api/v1/admin/webhooks/logs`
   - Default: `100` requests per minute per IP.

4. **Write Tier (`writeLimiter`)**
   - Applied to state-mutating and contract transaction-building endpoints:
     - `POST /api/v1/collateral/register`
     - `POST /api/v1/loan/request`
     - `POST /api/v1/loan/repay`
     - `POST /api/v1/loan/liquidate`
   - Default: `10` requests per minute per IP.

> [!NOTE]
> **Limiter Stacking:** When an endpoint is protected by both a specific limiter (e.g., `writeLimiter`) and the global limiter, each request increments both counters. A request will be rejected if either limiter's quota is exhausted.

### Complete Endpoint → Tier Mapping

| Method | Endpoint | Global | Auth | Read | Write |
|--------|----------|:------:|:----:|:----:|:-----:|
| `GET` | `/metrics` | ✅ | | | |
| `GET` | `/api/docs` | ✅ | | | |
| `GET` | `/api/auth/challenge` | ✅ | ✅ | | |
| `POST` | `/api/auth/login` | ✅ | ✅ | | |
| `POST` | `/api/auth/refresh` | ✅ | ✅ | | |
| `GET` | `/api/v1/health` | ✅ | | ✅ | |
| `GET` | `/api/v1/loan/:id` | ✅ | | ✅ | |
| `GET` | `/api/v1/health/:loanId` | ✅ | | ✅ | |
| `GET` | `/api/v1/loans` | ✅ | | ✅ | |
| `GET` | `/api/v1/collateral/:id` | ✅ | | ✅ | |
| `GET` | `/api/v1/settings/:wallet` | ✅ | | ✅ | |
| `GET` | `/api/v1/admin/webhooks` | ✅ | | ✅ | |
| `GET` | `/api/v1/admin/webhooks/logs` | ✅ | | ✅ | |
| `POST` | `/api/v1/collateral/register` | ✅ | | | ✅ |
| `POST` | `/api/v1/loan/request` | ✅ | | | ✅ |
| `POST` | `/api/v1/loan/repay` | ✅ | | | ✅ |
| `POST` | `/api/v1/loan/liquidate` | ✅ | | | ✅ |

---

## Response Headers

StellarKraal uses modern [IETF RFC draft standard headers](https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-ratelimit-headers) (`standardHeaders: true`, `legacyHeaders: false`):

| Header | Type | Description |
|--------|------|-------------|
| `RateLimit-Limit` | Integer | The total quota granted in the current window for the limiter handling the request. |
| `RateLimit-Remaining` | Integer | Number of requests remaining in the current window before rate-limiting occurs. |
| `RateLimit-Reset` | Integer | Number of seconds remaining until the rate limit window resets. |
| `RateLimit-Policy` | String | Expressed quota policy in the format `<limit>;w=<window_seconds>`. |
| `Retry-After` | Integer | Present on `429 Too Many Requests` responses. Indicates the number of seconds the client must wait before retrying. |

---

## Realistic Response Header Examples

### 1. Global Tier (`GET /api/v1/health`)

```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
RateLimit-Limit: 60
RateLimit-Remaining: 57
RateLimit-Reset: 42
RateLimit-Policy: 60;w=60
Date: Sat, 29 Aug 2026 01:00:00 GMT

{
  "status": "ok",
  "version": "1.0.0"
}
```

### 2. Auth Tier (`POST /api/auth/login`)

```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
RateLimit-Limit: 10
RateLimit-Remaining: 8
RateLimit-Reset: 54
RateLimit-Policy: 10;w=60
Date: Sat, 29 Aug 2026 01:00:06 GMT

{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 3600
}
```

### 3. Read Tier (`GET /api/v1/loans`)

```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
RateLimit-Limit: 100
RateLimit-Remaining: 92
RateLimit-Reset: 35
RateLimit-Policy: 100;w=60
Date: Sat, 29 Aug 2026 01:00:25 GMT

{
  "loans": [],
  "total": 0,
  "page": 1,
  "pageSize": 20
}
```

### 4. Write Tier (`POST /api/v1/collateral/register`)

```http
HTTP/1.1 201 Created
Content-Type: application/json; charset=utf-8
RateLimit-Limit: 10
RateLimit-Remaining: 6
RateLimit-Reset: 28
RateLimit-Policy: 10;w=60
Date: Sat, 29 Aug 2026 01:00:32 GMT

{
  "collateralId": "128",
  "status": "registered"
}
```

### 5. Exceeded Limit (429 Response)

When a client exhausts its quota within the 60-second window:

```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/json; charset=utf-8
Retry-After: 60
RateLimit-Limit: 10
RateLimit-Remaining: 0
RateLimit-Reset: 60
RateLimit-Policy: 10;w=60
Date: Sat, 29 Aug 2026 01:00:45 GMT

{
  "error": "Too many requests",
  "retryAfter": 60
}
```

---

## Burst Traffic and Token Replenishment

StellarKraal's limiters use a **fixed 60-second window** (not a token bucket). Understanding this behaviour is important for clients that send bursty traffic:

- **Bursts are allowed up to the tier limit.** A client may send all `N` requests of a tier's quota back-to-back within the window; there is no per-second smoothing. For example, the Read tier permits 100 requests in the first second of a window.
- **No gradual replenishment.** Quota does **not** refill one request at a time. The counter resets to the full limit only when the window rolls over (as indicated by `RateLimit-Reset`).
- **Window rollover is per client.** Each IP's window starts at its first request, so `RateLimit-Reset` tells you exactly how many seconds remain until your counter resets.
- **Stacked limiters compound bursts.** A burst of write requests consumes both the Write tier (10/min) and the Global tier (60/min). A burst of 10 writes leaves only 50 global requests for other calls in the same window.
- **429 responses do not consume quota.** Rejected requests are not counted against the limit, but retrying before `RateLimit-Reset` elapses will simply be rejected again.

**Recommended client behaviour during bursts:**

1. Read `RateLimit-Remaining` on every response and throttle proactively when it drops below a safety threshold (e.g. 10% of `RateLimit-Limit`).
2. Spread write requests across the window rather than firing them all at once.
3. On `429`, wait for `Retry-After` seconds (plus jitter) before retrying — do not retry immediately.

---

## `Retry-After` Header and Backoff Handling

When encountering an `HTTP 429 Too Many Requests` response:

1. **Check the `Retry-After` Header**: The server specifies the required delay in seconds. For StellarKraal, this is an integer (delta-seconds, e.g., `60`).
2. **Inspect the Body Payload**: The JSON error response payload mirrors this value in the `retryAfter` numerical field:
   ```json
   {
     "error": "Too many requests",
     "retryAfter": 60
   }
   ```
3. **Respect Server Delay**: The client application must pause all non-essential traffic for at least the specified number of seconds before attempting the request again.
4. **Apply Jitter**: Add a small randomized delay (jitter) to prevent synchronized retries across multiple concurrent clients (avoiding the *thundering herd* effect).

---

## Retry Algorithm with Exponential Backoff (Pseudocode)

When interacting with rate-limited APIs, clients should implement an exponential backoff algorithm with full jitter:

```text
Algorithm: RequestWithExponentialBackoffAndJitter

Input:
  request: HTTP Request object
  maxRetries: Maximum number of retry attempts (default: 5)
  baseDelayMs: Initial retry delay in milliseconds (default: 1000 ms)
  maxDelayMs: Maximum backoff ceiling in milliseconds (default: 30000 ms)

Output:
  HTTP Response object or Throws Exception

Begin:
  attempt := 0

  While attempt <= maxRetries Do:
    response := ExecuteHTTPRequest(request)

    // Return immediately on success or client errors other than 429
    If response.statusCode != 429 And response.statusCode < 500 Then:
      Return response
    End If

    attempt := attempt + 1
    If attempt > maxRetries Then:
      Throw Exception("Max retries exceeded for request. Last status: " + response.statusCode)
    End If

    // Determine sleep duration
    If response.statusCode == 429 And response.headers.has("Retry-After") Then:
      retryAfterSeconds := ParseInteger(response.headers.get("Retry-After"))
      // Convert to milliseconds and add a random jitter (0 - 500 ms)
      sleepMs := (retryAfterSeconds * 1000) + RandomInt(0, 500)
    Else:
      // Exponential backoff: baseDelay * 2^(attempt - 1)
      calculatedBackoff := Min(maxDelayMs, baseDelayMs * (2 ^ (attempt - 1)))
      // Full jitter: random duration between 0 and calculatedBackoff
      sleepMs := RandomFloat(0, 1) * calculatedBackoff
    End If

    Sleep(sleepMs)
  End While
End
```

---

## Client Implementation Examples

### JavaScript / TypeScript Example (Fetch API with Retry Logic)

The following example implements a reusable `fetchWithRetry` utility using native `fetch`:

```typescript
interface RequestOptions extends RequestInit {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

/**
 * Execute an HTTP request with automatic rate limit (429) & server error (5xx) retries.
 *
 * - Honours the `Retry-After` header on 429 responses.
 * - Falls back to exponential backoff with full jitter for 5xx errors.
 */
async function fetchWithRetry(
  url: string,
  options: RequestOptions = {}
): Promise<Response> {
  const {
    maxRetries = 5,
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    ...init
  } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, init);

    // Success or non-retryable client error
    if (response.status !== 429 && response.status < 500) {
      return response;
    }

    if (attempt === maxRetries) {
      throw new Error(
        `Max retries exceeded for ${url}. Last status: ${response.status}`
      );
    }

    let sleepMs: number;
    const retryAfter = response.headers.get('Retry-After');

    if (response.status === 429 && retryAfter) {
      // Respect the server-provided delay, plus a small jitter
      sleepMs = parseInt(retryAfter, 10) * 1000 + Math.random() * 500;
    } else {
      // Exponential backoff with full jitter
      const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
      sleepMs = Math.random() * backoff;
    }

    await new Promise((resolve) => setTimeout(resolve, sleepMs));
  }

  // Unreachable, but satisfies the type checker
  throw new Error('Unreachable');
}

// Usage
const res = await fetchWithRetry('https://api.stellarkraal.io/api/v1/loans', {
  method: 'GET',
  headers: { Accept: 'application/json' },
});
```

### Python Example (Requests with Retry Logic)

The following example implements a `request_with_retry` helper using the `requests` library:

```python
import random
import time
from typing import Optional

import requests


def request_with_retry(
    method: str,
    url: str,
    max_retries: int = 5,
    base_delay_s: float = 1.0,
    max_delay_s: float = 30.0,
    **kwargs,
) -> requests.Response:
    """Execute an HTTP request with 429/5xx retries.

    - Honours the ``Retry-After`` header on 429 responses.
    - Falls back to exponential backoff with full jitter for 5xx errors.
    """
    for attempt in range(max_retries + 1):
        response = requests.request(method, url, **kwargs)

        # Success or non-retryable client error
        if response.status_code != 429 and response.status_code < 500:
            return response

        if attempt == max_retries:
            raise RuntimeError(
                f"Max retries exceeded for {url}. "
                f"Last status: {response.status_code}"
            )

        retry_after: Optional[str] = response.headers.get("Retry-After")

        if response.status_code == 429 and retry_after is not None:
            # Respect the server-provided delay, plus a small jitter
            sleep_s = int(retry_after) + random.uniform(0, 0.5)
        else:
            # Exponential backoff with full jitter
            backoff = min(max_delay_s, base_delay_s * (2 ** attempt))
            sleep_s = random.uniform(0, backoff)

        time.sleep(sleep_s)

    raise RuntimeError("Unreachable")


# Usage
response = request_with_retry(
    "GET",
    "https://api.stellarkraal.io/api/v1/loans",
    headers={"Accept": "application/json"},
)
print(response.json())
```

---

## Best Practices Summary

- **Always read `RateLimit-Remaining`** and throttle before hitting zero.
- **Never retry a 429 immediately** — wait at least `Retry-After` seconds.
- **Add jitter** to every retry delay to avoid synchronized retries.
- **Cap backoff** at a sensible ceiling (e.g. 30 seconds) to avoid unbounded waits.
- **Cache aggressively** for read-heavy workloads to stay well under the Read tier.
- **Batch writes** where possible to stay under the Write tier's 10 req/min limit.
