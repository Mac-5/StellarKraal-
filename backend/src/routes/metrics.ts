import { Router, Request, Response } from 'express';
import client from 'prom-client';

const router = Router();

// Default metrics (process, node, etc.)
client.collectDefaultMetrics();

// Histogram tracking Soroban contract invocation latency.
// Labels:
//   operation: request_loan | repay_loan | liquidate
//   status:    success | error
export const contractInvocationDuration = new client.Histogram({
  name: 'contract_invocation_duration_seconds',
  help: 'Duration of Soroban contract invocations in seconds',
  labelNames: ['operation', 'status'] as const,
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

/**
 * Record the duration of a Soroban RPC call.
 *
 * @param operation - contract operation name (request_loan, repay_loan, liquidate)
 * @param status    - outcome of the call (success or error)
 * @param durationSeconds - elapsed time in seconds
 */
export function recordContractInvocation(
  operation: 'request_loan' | 'repay_loan' | 'liquidate',
  status: 'success' | 'error',
  durationSeconds: number,
): void {
  contractInvocationDuration.observe({ operation, status }, durationSeconds);
}

router.get('/metrics', async (_req: Request, res: Response) => {
  try {
    res.set('Content-Type', client.register.contentType);
    res.end(await client.register.metrics());
  } catch (err) {
    res.status(500).end(String(err));
  }
});

export default router;
