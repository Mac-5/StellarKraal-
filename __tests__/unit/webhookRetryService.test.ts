import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WebhookRetryService } from '../../src/services/webhookRetryService';

describe('WebhookRetryService', () => {
  let service: WebhookRetryService;
  let mockFetch: any;

  beforeEach(() => {
    service = new WebhookRetryService({
      maxAttempts: 3,
      baseDelayMs: 100,
      maxDelayMs: 400
    });

    // Mock fetch globally
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  describe('calculateBackoff', () => {
    it('should calculate correct backoff delay', () => {
      const service = new WebhookRetryService();

      // Attempt 1: 1s
      expect(service['calculateBackoff'](1)).toBe(1000);

      // Attempt 2: 2s
      expect(service['calculateBackoff'](2)).toBe(2000);

      // Attempt 3: 4s
      expect(service['calculateBackoff'](3)).toBe(4000);

      // Attempt 4: 8s
      expect(service['calculateBackoff'](4)).toBe(8000);

      // Attempt 5: 16s
      expect(service['calculateBackoff'](5)).toBe(16000);

      // Attempt 6: 16s (capped)
      expect(service['calculateBackoff'](6)).toBe(16000);
    });
  });

  describe('scheduleRetry', () => {
    it('should schedule a retry with correct parameters', async () => {
      const webhookId = 'wh-001';
      const url = 'https://example.com/webhook';
      const payload = { event: 'test' };
      const attemptNumber = 1;

      const result = await service.scheduleRetry(webhookId, url, payload, attemptNumber);

      expect(result).toBeDefined();
      expect(result.webhookId).toBe(webhookId);
      expect(result.url).toBe(url);
      expect(result.attemptNumber).toBe(attemptNumber);
      expect(result.status).toBe('pending');
    });
  });

  describe('processDelivery', () => {
    it('should mark delivery as success when fetch succeeds', async () => {
      // Mock successful fetch
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK'
      });

      // Create a delivery
      const delivery = await service.scheduleRetry(
        'wh-001',
        'https://example.com/webhook',
        { event: 'test' },
        1
      );

      // Process the delivery
      const result = await service.processDelivery(delivery.id);

      expect(result.status).toBe('success');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        })
      );
    });

    it('should retry when fetch fails', async () => {
      // Mock failed fetch
      mockFetch.mockRejectedValue(new Error('Network error'));

      // Create a delivery
      const delivery = await service.scheduleRetry(
        'wh-001',
        'https://example.com/webhook',
        { event: 'test' },
        1
      );

      // Process the delivery
      const result = await service.processDelivery(delivery.id);

      expect(result.status).toBe('pending');
      expect(result.attemptNumber).toBe(2);
      expect(result.lastError).toBe('Network error');
      expect(result.nextRetryAt).toBeDefined();
    });

    it('should mark as permanent failure after max attempts', async () => {
      // Mock failed fetch
      mockFetch.mockRejectedValue(new Error('Network error'));

      // Create a delivery at max attempts - 1
      const delivery = await service.scheduleRetry(
        'wh-001',
        'https://example.com/webhook',
        { event: 'test' },
        3
      );

      // Process the delivery (should be attempt 4, > max 3)
      const result = await service.processDelivery(delivery.id);

      expect(result.status).toBe('permanent_failure');
      expect(result.lastError).toBe('Network error');
    });
  });

  describe('exponential backoff', () => {
    it('should use exponential backoff for retries', async () => {
      const service = new WebhookRetryService();

      // Attempt 1: 1s
      const delay1 = service['calculateBackoff'](1);
      expect(delay1).toBe(1000);

      // Attempt 2: 2s
      const delay2 = service['calculateBackoff'](2);
      expect(delay2).toBe(2000);

      // Attempt 3: 4s
      const delay3 = service['calculateBackoff'](3);
      expect(delay3).toBe(4000);

      // Attempt 4: 8s
      const delay4 = service['calculateBackoff'](4);
      expect(delay4).toBe(8000);

      // Attempt 5: 16s
      const delay5 = service['calculateBackoff'](5);
      expect(delay5).toBe(16000);
    });

    it('should cap delay at maxDelayMs', async () => {
      const service = new WebhookRetryService({
        maxAttempts: 10,
        baseDelayMs: 1000,
        maxDelayMs: 5000
      });

      expect(service['calculateBackoff'](1)).toBe(1000);
      expect(service['calculateBackoff'](2)).toBe(2000);
      expect(service['calculateBackoff'](3)).toBe(4000);
      expect(service['calculateBackoff'](4)).toBe(5000); // Capped
      expect(service['calculateBackoff'](5)).toBe(5000); // Capped
    });
  });

  describe('getDeliveryHistory', () => {
    it('should return delivery history for a webhook', async () => {
      const history = await service.getDeliveryHistory('wh-001');
      expect(history).toBeDefined();
      expect(Array.isArray(history)).toBe(true);
    });
  });
});
