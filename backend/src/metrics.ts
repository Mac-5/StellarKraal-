import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from "prom-client";

export const registry = new Registry();

// Collect default Node.js metrics (memory, CPU, event loop lag, etc.)
collectDefaultMetrics({ register: registry });

export const httpRequestsTotal = new Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status_code"] as const,
  registers: [registry],
});

export const httpRequestDurationSeconds = new Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status_code"] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

export const httpActiveConnections = new Gauge({
  name: "http_active_connections",
  help: "Number of active HTTP connections",
  registers: [registry],
});

export const rpcCallDurationSeconds = new Histogram({
  name: "rpc_call_duration_seconds",
  help: "Soroban RPC call duration in seconds",
  labelNames: ["operation", "status"] as const,
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

/**
 * Contract invocation latency in seconds.
 * Labels: operation (request_loan, repay_loan, liquidate), status (success/error)
 */
export const contractInvocationDurationSeconds = new Histogram({
  name: "contract_invocation_duration_seconds",
  help: "Soroban contract invocation duration in seconds",
  labelNames: ["operation", "status"] as const,
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

// ── DB Connection Pool metrics ────────────────────────────────────────────────

/** Total number of connections acquired from the pool since process start. */
export const dbPoolAcquiredTotal = new Counter({
  name: "db_pool_acquired_total",
  help: "Total number of DB pool connections acquired",
  registers: [registry],
});

/** Current number of available (idle) connections in the pool. */
export const dbPoolAvailable = new Gauge({
  name: "db_pool_available",
  help: "Number of idle connections available in the DB pool",
  registers: [registry],
});

/**
 * Histogram of wait times (in milliseconds) from pool.acquire() call to
 * connection obtained. High values indicate pool exhaustion pressure.
 */
export const dbPoolWaitMs = new Histogram({
  name: "db_pool_wait_ms",
  help: "Time spent waiting to acquire a DB pool connection (ms)",
  buckets: [0, 1, 5, 10, 25, 50, 100, 250, 500],
  registers: [registry],
});

// ── Loan Lifecycle Metrics ────────────────────────────────────────────────────

/**
 * Total number of loans created.
 * Labels: collateral_type (animal type), status (initial status)
 */
export const loanCreatedTotal = new Counter({
  name: "loan_created_total",
  help: "Total number of loans created",
  labelNames: ["collateral_type", "status"] as const,
  registers: [registry],
});

/**
 * Total amount of loans repaid (in stroops).
 * Labels: collateral_type (animal type), status (after repayment)
 */
export const loanRepaidTotal = new Counter({
  name: "loan_repaid_total",
  help: "Total amount of loans repaid in stroops",
  labelNames: ["collateral_type", "status"] as const,
  registers: [registry],
});

/**
 * Total number of loans liquidated.
 * Labels: collateral_type (animal type), status (liquidated)
 */
export const loanLiquidatedTotal = new Counter({
  name: "loan_liquidated_total",
  help: "Total number of loans liquidated",
  labelNames: ["collateral_type", "status"] as const,
  registers: [registry],
});
