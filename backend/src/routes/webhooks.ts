import { Router, Request, Response } from 'express';
import { WebhookRetryService } from '../services/webhookRetryService';

const router = Router();
const retryService = new WebhookRetryService();

// In-memory delivery history keyed by webhook id.
// Each entry records the attempt number, status, timestamp and error (if any).
interface DeliveryAttempt {
  attempt: number;
  status: 'success' | 'failed' | 'retrying';
  timestamp: string;
  error?: string;
}

interface DeliveryRecord {
  id: string;
  webhookId: string;
  event: string;
  payload: unknown;
  status: 'pending' | 'success' | 'failed';
  attempts: DeliveryAttempt[];
  createdAt: string;
  updatedAt: string;
}

const deliveries: DeliveryRecord[] = [];

function findDelivery(id: string): DeliveryRecord | undefined {
  return deliveries.find((d) => d.id === id);
}

/**
 * Enqueue a failed delivery for retry with exponential backoff.
 * Delays: 1s, 2s, 4s, 8s, 16s (max 5 retries).
 */
async function enqueueRetry(delivery: DeliveryRecord): Promise<void> {
  const maxRetries = 5;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const delayMs = Math.pow(2, attempt - 1) * 1000;

    delivery.attempts.push({
      attempt,
      status: 'retrying',
      timestamp: new Date().toISOString(),
    });
    delivery.updatedAt = new Date().toISOString();

    try {
      await retryService.deliverWithRetry(delivery.webhookId, delivery.payload, {
        attempt,
        delayMs,
      });

      delivery.attempts[delivery.attempts.length - 1].status = 'success';
      delivery.status = 'success';
      delivery.updatedAt = new Date().toISOString();
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      delivery.attempts[delivery.attempts.length - 1].status = 'failed';
      delivery.attempts[delivery.attempts.length - 1].error = message;
      delivery.updatedAt = new Date().toISOString();
    }
  }

  // Exhausted all retries.
  delivery.status = 'failed';
  delivery.updatedAt = new Date().toISOString();
}

// POST /api/v1/webhooks/:id/deliveries — record a delivery attempt.
router.post('/:id/deliveries', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { event, payload } = req.body ?? {};

  if (!event) {
    return res.status(400).json({ error: 'event is required' });
  }

  const now = new Date().toISOString();
  const delivery: DeliveryRecord = {
    id: `${id}-${Date.now()}`,
    webhookId: id,
    event,
    payload,
    status: 'pending',
    attempts: [],
    createdAt: now,
    updatedAt: now,
  };
  deliveries.push(delivery);

  // Attempt initial delivery; on failure enqueue retries automatically.
  try {
    await retryService.deliverWithRetry(id, payload, { attempt: 0, delayMs: 0 });
    delivery.attempts.push({
      attempt: 0,
      status: 'success',
      timestamp: new Date().toISOString(),
    });
    delivery.status = 'success';
    delivery.updatedAt = new Date().toISOString();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    delivery.attempts.push({
      attempt: 0,
      status: 'failed',
      timestamp: new Date().toISOString(),
      error: message,
    });
    delivery.status = 'pending';
    delivery.updatedAt = new Date().toISOString();

    // Fire-and-forget retry queue.
    void enqueueRetry(delivery);
  }

  return res.status(202).json(delivery);
});

// GET /api/v1/webhooks/:id/deliveries — list deliveries with retry history.
router.get('/:id/deliveries', (req: Request, res: Response) => {
  const { id } = req.params;
  const history = deliveries.filter((d) => d.webhookId === id);
  return res.json({ webhookId: id, deliveries: history });
});

export default router;
