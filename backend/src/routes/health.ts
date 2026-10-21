/**
 * Deep health check route
 * GET /api/v1/health/deep
 *
 * Verifies DB connectivity, Soroban RPC reachability, and available disk space.
 * Excluded from JWT auth and rate-limit middleware — registered before those are applied.
 */

import { Router, Request, Response } from "express";
import { checkDbHealth } from "../db/migrationRunner";
import rpcClient from "../utils/rpcClient";
import logger from "../utils/logger";

/** Minimum free disk bytes before reporting degraded (500 MB) */
const DISK_MIN_FREE_BYTES = 500 * 1024 * 1024;

/** Per-component timeout for the aggregated /health check (ms) */
const COMPONENT_TIMEOUT_MS = 3000;

type ComponentStatus = "ok" | "degraded";

interface DeepHealthResponse {
  db: ComponentStatus;
  rpc: ComponentStatus;
  disk: ComponentStatus;
}

type AggregatedStatus = "healthy" | "degraded" | "unhealthy";

interface HealthResponse {
  status: AggregatedStatus;
  components: {
    db: ComponentStatus;
    rpc: ComponentStatus;
    eventListener: ComponentStatus;
  };
}

/**
 * Run a health check with a timeout so a hanging dependency cannot block the
 * response. Resolves to `true` when the check succeeds within the timeout.
 */
async function withTimeout(
  check: () => Promise<boolean>,
  timeoutMs: number = COMPONENT_TIMEOUT_MS
): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  try {
    return await Promise.race([
      check().catch(() => false),
      timeout,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Check available disk space on the current working directory partition.
 * Uses Node's `fs.statfs` (Node 19+) and falls back to a child-process `df` call.
 * Returns true when free space is above {@link DISK_MIN_FREE_BYTES}.
 */
async function checkDiskHealth(): Promise<boolean> {
  return new Promise((resolve) => {
    // fs.statfs is available from Node 19+; use a df fallback for older runtimes
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require("fs") as typeof import("fs");
    if (typeof (fs as any).statfs === "function") {
      (fs as any).statfs(process.cwd(), (err: NodeJS.ErrnoException | null, stats: any) => {
        if (err) {
          logger.warn("disk health check failed (statfs)", { error: err.message });
          return resolve(false);
        }
        const freeBytes: number = stats.bfree * stats.bsize;
        resolve(freeBytes >= DISK_MIN_FREE_BYTES);
      });
    } else {
      // Fallback: parse `df` output
      const { exec } = require("child_process") as typeof import("child_process");
      exec(`df -k "${process.cwd()}"`, (err, stdout) => {
        if (err) {
          logger.warn("disk health check failed (df)", { error: err.message });
          return resolve(false);
        }
        // df output: Filesystem 1K-blocks Used Available Use% Mounted
        const lines = stdout.trim().split("\n");
        const parts = lines[lines.length - 1].trim().split(/\s+/);
        const availableKb = parseInt(parts[3], 10);
        if (isNaN(availableKb)) return resolve(false);
        resolve(availableKb * 1024 >= DISK_MIN_FREE_BYTES);
      });
    }
  });
}

/**
 * Check whether the event listener is running. The listener module exposes an
 * optional `isRunning` helper; when unavailable we treat it as degraded.
 */
async function checkEventListenerHealth(): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const listener = require("../services/eventListener");
    if (typeof listener.isRunning === "function") {
      return Boolean(listener.isRunning());
    }
    if (typeof listener.getStatus === "function") {
      return listener.getStatus() === "running";
    }
    return false;
  } catch (err) {
    logger.warn("event listener health check failed", {
      error: (err as Error).message,
    });
    return false;
  }
}

const healthRouter = Router();

/**
 * GET /health
 *
 * Aggregated health check for Docker / ECS health probes. Reports the status
 * of all critical dependencies with a per-component timeout.
 *
 * @returns 200 `{ status: "healthy", components: { db, rpc, eventListener } }`
 * @returns 503 `{ status: "degraded" | "unhealthy", components }`
 */
healthRouter.get("/", async (_req: Request, res: Response) => {
  const [dbHealthy, rpcHealthy, listenerHealthy] = await Promise.all([
    withTimeout(checkDbHealth),
    withTimeout(() => rpcClient.getHealth().then(() => true).catch(() => false)),
    withTimeout(checkEventListenerHealth),
  ]);

  const components = {
    db: (dbHealthy ? "ok" : "degraded") as ComponentStatus,
    rpc: (rpcHealthy ? "ok" : "degraded") as ComponentStatus,
    eventListener: (listenerHealthy ? "ok" : "degraded") as ComponentStatus,
  };

  const healthyCount = [dbHealthy, rpcHealthy, listenerHealthy].filter(Boolean).length;
  let status: AggregatedStatus;
  if (healthyCount === 3) {
    status = "healthy";
  } else if (healthyCount === 0) {
    status = "unhealthy";
  } else {
    status = "degraded";
  }

  const body: HealthResponse = { status, components };
  res.status(status === "healthy" ? 200 : 503).json(body);
});

/**
 * GET /health/live
 *
 * Liveness probe — confirms the process is running and can accept requests.
 * No dependency checks; Kubernetes restarts the pod only when this fails.
 *
 * @returns 200 `{ status: "alive" }`
 */
healthRouter.get("/live", (_req: Request, res: Response) => {
  res.status(200).json({ status: "alive" });
});

/**
 * GET /health/ready
 *
 * Readiness probe — confirms external dependencies (DB, Soroban RPC) are
 * reachable. Kubernetes stops routing traffic when this returns 503.
 *
 * @returns 200 `{ status: "ready", db, rpc }` — all dependencies reachable
 * @returns 503 `{ status: "not_ready", db, rpc }` — one or more unreachable
 */
healthRouter.get("/ready", async (_req: Request, res: Response) => {
  const [dbHealthy, rpcHealthy] = await Promise.allSettled([
    checkDbHealth(),
    rpcClient.getHealth().then(() => true).catch(() => false),
  ]).then((results) =>
    results.map((r) => (r.status === "fulfilled" ? r.value : false))
  );

  const ready = dbHealthy && rpcHealthy;
  res.status(ready ? 200 : 503).json({
    status: ready ? "ready" : "not_ready",
    db: dbHealthy ? "ok" : "degraded",
    rpc: rpcHealthy ? "ok" : "degraded",
  });
});

/**
 * GET /health/deep
 *
 * Returns the health status of each infrastructure component.
 *
 * @returns 200 `{ db, rpc, disk }` — all components healthy
 * @returns 503 `{ db, rpc, disk }` — one or more components degraded
 */
healthRouter.get("/deep", async (_req: Request, res: Response) => {
  const [dbHealthy, rpcHealthy, diskHealthy] = await Promise.allSettled([
    checkDbHealth(),
    rpcClient.getHealth().then(() => true).catch(() => false),
    checkDiskHealth(),
  ]).then((results) =>
    results.map((r) => (r.status === "fulfilled" ? r.value : false))
  );

  const body: DeepHealthResponse = {
    db: dbHealthy ? "ok" : "degraded",
    rpc: rpcHealthy ? "ok" : "degraded",
    disk: diskHealthy ? "ok" : "degraded",
  };

  const allHealthy = dbHealthy && rpcHealthy && diskHealthy;
  res.status(allHealthy ? 200 : 503).json(body);
});

export { healthRouter, checkDiskHealth };
