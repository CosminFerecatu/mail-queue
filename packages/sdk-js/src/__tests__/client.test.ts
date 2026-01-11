import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MailQueue } from '../client.js';
import {
  AuthenticationError,
  ValidationError,
  RateLimitError,
  NotFoundError,
  NetworkError,
  TimeoutError,
} from '../errors.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('MailQueue', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should throw if no API key provided', () => {
      expect(() => new MailQueue({ apiKey: '' })).toThrow('API key is required');
    });

    it('should create client with API key', () => {
      const mq = new MailQueue({ apiKey: 'mq_test_123' });
      expect(mq).toBeInstanceOf(MailQueue);
      expect(mq.emails).toBeDefined();
      expect(mq.queues).toBeDefined();
      expect(mq.analytics).toBeDefined();
    });

    it('should use custom base URL', () => {
      const mq = new MailQueue({
        apiKey: 'mq_test_123',
        baseUrl: 'https://custom.api.com',
      });
      expect(mq).toBeInstanceOf(MailQueue);
    });
  });

  describe('emails.send', () => {
    it('should send email successfully', async () => {
      const mq = new MailQueue({ apiKey: 'mq_test_123' });
      const mockEmail = {
        id: 'email-123',
        queueId: 'queue-123',
        queueName: 'transactional',
        status: 'queued',
        from: { email: 'test@example.com' },
        to: [{ email: 'user@example.com' }],
        subject: 'Test',
        createdAt: new Date().toISOString(),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ success: true, data: mockEmail }),
      });

      const result = await mq.emails.send({
        queue: 'transactional',
        from: { email: 'test@example.com' },
        to: [{ email: 'user@example.com' }],
        subject: 'Test',
        html: '<p>Test</p>',
      });

      expect(result).toEqual(mockEmail);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('/v1/emails');
      expect(options.method).toBe('POST');
      expect(options.headers.Authorization).toBe('Bearer mq_test_123');
    });

    it('should include idempotency key header', async () => {
      const mq = new MailQueue({ apiKey: 'mq_test_123' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ success: true, data: { id: 'email-123' } }),
      });

      await mq.emails.send({
        queue: 'transactional',
        from: { email: 'test@example.com' },
        to: [{ email: 'user@example.com' }],
        subject: 'Test',
        html: '<p>Test</p>',
        idempotencyKey: 'unique-key-123',
      });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Idempotency-Key']).toBe('unique-key-123');
    });
  });

  describe('error handling', () => {
    it('should throw AuthenticationError on 401', async () => {
      const mq = new MailQueue({ apiKey: 'invalid-key' });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: new Headers(),
        json: async () => ({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Invalid API key' },
        }),
      });

      await expect(mq.emails.list()).rejects.toThrow(AuthenticationError);
    });

    it('should throw ValidationError on 400', async () => {
      const mq = new MailQueue({ apiKey: 'mq_test_123' });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        headers: new Headers(),
        json: async () => ({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: [{ path: 'to', message: 'Required' }],
          },
        }),
      });

      await expect(
        mq.emails.send({
          queue: 'test',
          from: { email: 'test@example.com' },
          to: [],
          subject: 'Test',
          html: '<p>Test</p>',
        })
      ).rejects.toThrow(ValidationError);
    });

    it('should throw RateLimitError on 429', async () => {
      const mq = new MailQueue({ apiKey: 'mq_test_123', retry: { maxRetries: 0 } });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Headers({
          'Retry-After': '60',
          'X-RateLimit-Limit': '100',
          'X-RateLimit-Remaining': '0',
        }),
        json: async () => ({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Rate limit exceeded',
            retryAfter: 60,
          },
        }),
      });

      try {
        await mq.emails.list();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitError);
        expect((error as RateLimitError).retryAfter).toBe(60);
      }
    });

    it('should throw NotFoundError on 404', async () => {
      const mq = new MailQueue({ apiKey: 'mq_test_123' });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        headers: new Headers(),
        json: async () => ({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Email not found' },
        }),
      });

      await expect(mq.emails.get('nonexistent-id')).rejects.toThrow(NotFoundError);
    });

    it('should throw TimeoutError on abort', async () => {
      const mq = new MailQueue({ apiKey: 'mq_test_123', timeout: 100, retry: { maxRetries: 0 } });

      mockFetch.mockImplementationOnce(() => {
        const error = new Error('Aborted');
        error.name = 'AbortError';
        throw error;
      });

      await expect(mq.emails.list()).rejects.toThrow(TimeoutError);
    });

    it('should throw NetworkError on network failure', async () => {
      const mq = new MailQueue({ apiKey: 'mq_test_123', retry: { maxRetries: 0 } });

      mockFetch.mockRejectedValueOnce(new Error('Network failed'));

      await expect(mq.emails.list()).rejects.toThrow(NetworkError);
    });
  });

  describe('retry logic', () => {
    it('should retry on 5xx errors', async () => {
      const mq = new MailQueue({
        apiKey: 'mq_test_123',
        retry: { maxRetries: 2, initialDelay: 10 },
      });

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          headers: new Headers(),
          json: async () => ({
            success: false,
            error: { code: 'SERVER_ERROR', message: 'Internal error' },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: [] }),
        });

      const result = await mq.emails.list();
      expect(result).toEqual([]);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should not retry on 4xx errors (except 429)', async () => {
      const mq = new MailQueue({
        apiKey: 'mq_test_123',
        retry: { maxRetries: 3 },
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        headers: new Headers(),
        json: async () => ({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Bad request' },
        }),
      });

      await expect(mq.emails.list()).rejects.toThrow(ValidationError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should retry on 429 errors', async () => {
      const mq = new MailQueue({
        apiKey: 'mq_test_123',
        retry: { maxRetries: 2, initialDelay: 10 },
      });

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: new Headers({ 'Retry-After': '1' }),
          json: async () => ({
            success: false,
            error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Rate limited' },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: [] }),
        });

      const result = await mq.emails.list();
      expect(result).toEqual([]);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('queues', () => {
    it('should create queue', async () => {
      const mq = new MailQueue({ apiKey: 'mq_test_123' });
      const mockQueue = {
        id: 'queue-123',
        name: 'transactional',
        priority: 8,
        isPaused: false,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ success: true, data: mockQueue }),
      });

      const result = await mq.queues.create({
        name: 'transactional',
        priority: 8,
      });

      expect(result.name).toBe('transactional');
      expect(result.priority).toBe(8);
    });

    it('should pause queue', async () => {
      const mq = new MailQueue({ apiKey: 'mq_test_123' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: { id: 'queue-123', isPaused: true },
        }),
      });

      const result = await mq.queues.pause('queue-123');
      expect(result.isPaused).toBe(true);
    });
  });

  describe('analytics', () => {
    it('should get overview', async () => {
      const mq = new MailQueue({ apiKey: 'mq_test_123' });
      const mockOverview = {
        period: { from: '2024-01-01', to: '2024-01-31' },
        totals: { sent: 1000, delivered: 950 },
        rates: { deliveryRate: 95.0 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: mockOverview }),
      });

      const result = await mq.analytics.getOverview({
        from: '2024-01-01T00:00:00Z',
        to: '2024-01-31T23:59:59Z',
      });

      expect(result.rates.deliveryRate).toBe(95.0);
    });
  });

  describe('suppression', () => {
    it('should add to suppression list', async () => {
      const mq = new MailQueue({ apiKey: 'mq_test_123' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          success: true,
          data: {
            id: 'entry-123',
            emailAddress: 'bounce@example.com',
            reason: 'hard_bounce',
          },
        }),
      });

      const result = await mq.suppression.add({
        emailAddress: 'bounce@example.com',
        reason: 'hard_bounce',
      });

      expect(result.emailAddress).toBe('bounce@example.com');
      expect(result.reason).toBe('hard_bounce');
    });

    it('should check suppression', async () => {
      const mq = new MailQueue({ apiKey: 'mq_test_123' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            emailAddress: 'user@example.com',
            isSuppressed: false,
            reason: null,
          },
        }),
      });

      const result = await mq.suppression.check('user@example.com');
      expect(result.isSuppressed).toBe(false);
    });
  });
});
