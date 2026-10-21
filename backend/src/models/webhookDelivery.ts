export type WebhookDeliveryStatus = 'pending' | 'success' | 'failed';

export interface WebhookDeliveryAttempt {
  attempt: number;
  attemptedAt: string;
  statusCode?: number;
  error?: string;
  success: boolean;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: string;
  payload: unknown;
  status: WebhookDeliveryStatus;
  attempts: WebhookDeliveryAttempt[];
  retryCount: number;
  nextRetryAt?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Exponential backoff schedule for webhook delivery retries.
 * Delays: 1s, 2s, 4s, 8s, 16s (max 5 retries).
 */
export const WEBHOOK_RETRY_DELAYS_MS: readonly number[] = [
  1000,
  2000,
  4000,
  8000,
  16000,
];

export const WEBHOOK_MAX_RETRIES = WEBHOOK_RETRY_DELAYS_MS.length;

/**
 * Returns the backoff delay in milliseconds for the given retry attempt
 * (0-indexed). Returns `undefined` once the retry budget is exhausted.
 */
export function getRetryDelayMs(retryCount: number): number | undefined {
  if (retryCount < 0 || retryCount >= WEBHOOK_MAX_RETRIES) {
    return undefined;
  }
  return WEBHOOK_RETRY_DELAYS_MS[retryCount];
}

/**
 * Computes the next retry timestamp for a delivery, or `undefined` when no
 * further retries are allowed.
 */
export function computeNextRetryAt(
  retryCount: number,
  from: Date = new Date(),
): string | undefined {
  const delay = getRetryDelayMs(retryCount);
  if (delay === undefined) {
    return undefined;
  }
  return new Date(from.getTime() + delay).toISOString();
}

/**
 * Records a failed delivery attempt and schedules the next retry. Once the
 * retry budget is exhausted the delivery is marked `failed`.
 */
export function recordFailedAttempt(
  delivery: WebhookDelivery,
  error: string,
  statusCode?: number,
  now: Date = new Date(),
): WebhookDelivery {
  const attempt: WebhookDeliveryAttempt = {
    attempt: delivery.attempts.length + 1,
    attemptedAt: now.toISOString(),
    statusCode,
    error,
    success: false,
  };

  const retryCount = delivery.retryCount + 1;
  const nextRetryAt = computeNextRetryAt(retryCount, now);

  return {
    ...delivery,
    attempts: [...delivery.attempts, attempt],
    retryCount,
    nextRetryAt,
    status: nextRetryAt === undefined ? 'failed' : 'pending',
    updatedAt: now.toISOString(),
  };
}

/**
 * Records a successful delivery attempt and clears any pending retry.
 */
export function recordSuccessfulAttempt(
  delivery: WebhookDelivery,
  statusCode?: number,
  now: Date = new Date(),
): WebhookDelivery {
  const attempt: WebhookDeliveryAttempt = {
    attempt: delivery.attempts.length + 1,
    attemptedAt: now.toISOString(),
    statusCode,
    success: true,
  };

  return {
    ...delivery,
    attempts: [...delivery.attempts, attempt],
    nextRetryAt: undefined,
    status: 'success',
    updatedAt: now.toISOString(),
  };
}
