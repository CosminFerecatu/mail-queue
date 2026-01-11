import { describe, it, expect } from 'vitest';
import {
  MailQueueError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
  RateLimitError,
  ConflictError,
  ServerError,
  ServiceUnavailableError,
  NetworkError,
  TimeoutError,
  createErrorFromResponse,
} from '../errors.js';

describe('errors', () => {
  describe('MailQueueError', () => {
    it('should create error with message and code', () => {
      const error = new MailQueueError('Test error', 'TEST_ERROR', 400);
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.statusCode).toBe(400);
      expect(error.name).toBe('MailQueueError');
    });

    it('should include details', () => {
      const error = new MailQueueError('Test', 'TEST', 400, { field: 'value' });
      expect(error.details).toEqual({ field: 'value' });
    });
  });

  describe('AuthenticationError', () => {
    it('should create with default message', () => {
      const error = new AuthenticationError();
      expect(error.message).toBe('Invalid or expired API key');
      expect(error.code).toBe('AUTHENTICATION_ERROR');
      expect(error.statusCode).toBe(401);
    });

    it('should create with custom message', () => {
      const error = new AuthenticationError('Custom message');
      expect(error.message).toBe('Custom message');
    });
  });

  describe('AuthorizationError', () => {
    it('should create with default message', () => {
      const error = new AuthorizationError();
      expect(error.message).toBe('Insufficient permissions');
      expect(error.code).toBe('AUTHORIZATION_ERROR');
      expect(error.statusCode).toBe(403);
    });
  });

  describe('NotFoundError', () => {
    it('should create with resource name', () => {
      const error = new NotFoundError('Email');
      expect(error.message).toBe('Email not found');
      expect(error.statusCode).toBe(404);
    });

    it('should create with resource name and ID', () => {
      const error = new NotFoundError('Email', 'email-123');
      expect(error.message).toBe("Email with ID 'email-123' not found");
    });
  });

  describe('ValidationError', () => {
    it('should create with validation errors', () => {
      const validationErrors = [
        { path: 'email', message: 'Invalid email format' },
        { path: 'subject', message: 'Required' },
      ];
      const error = new ValidationError('Validation failed', validationErrors);
      expect(error.message).toBe('Validation failed');
      expect(error.validationErrors).toEqual(validationErrors);
      expect(error.statusCode).toBe(400);
    });
  });

  describe('RateLimitError', () => {
    it('should create with rate limit info', () => {
      const error = new RateLimitError('Rate limited', 60, 100, 0, 1704067200);
      expect(error.message).toBe('Rate limited');
      expect(error.retryAfter).toBe(60);
      expect(error.limit).toBe(100);
      expect(error.remaining).toBe(0);
      expect(error.resetAt).toBe(1704067200);
      expect(error.statusCode).toBe(429);
    });
  });

  describe('ConflictError', () => {
    it('should create with message', () => {
      const error = new ConflictError('Resource already exists');
      expect(error.message).toBe('Resource already exists');
      expect(error.statusCode).toBe(409);
    });
  });

  describe('ServerError', () => {
    it('should create with default message', () => {
      const error = new ServerError();
      expect(error.message).toBe('Internal server error');
      expect(error.statusCode).toBe(500);
    });
  });

  describe('ServiceUnavailableError', () => {
    it('should create with retry after', () => {
      const error = new ServiceUnavailableError('Maintenance', 300);
      expect(error.message).toBe('Maintenance');
      expect(error.retryAfter).toBe(300);
      expect(error.statusCode).toBe(503);
    });
  });

  describe('NetworkError', () => {
    it('should create with original error', () => {
      const originalError = new Error('Connection refused');
      const error = new NetworkError('Network failed', originalError);
      expect(error.message).toBe('Network failed');
      expect(error.originalError).toBe(originalError);
    });
  });

  describe('TimeoutError', () => {
    it('should create with timeout value', () => {
      const error = new TimeoutError('Timed out', 30000);
      expect(error.message).toBe('Timed out');
      expect(error.timeoutMs).toBe(30000);
    });
  });

  describe('createErrorFromResponse', () => {
    it('should create AuthenticationError for 401', () => {
      const error = createErrorFromResponse(401, { message: 'Invalid key' });
      expect(error).toBeInstanceOf(AuthenticationError);
    });

    it('should create AuthorizationError for 403', () => {
      const error = createErrorFromResponse(403, { message: 'Forbidden' });
      expect(error).toBeInstanceOf(AuthorizationError);
    });

    it('should create NotFoundError for 404', () => {
      const error = createErrorFromResponse(404, { message: 'Not found' });
      expect(error).toBeInstanceOf(NotFoundError);
    });

    it('should create ValidationError for 400 with VALIDATION_ERROR code', () => {
      const error = createErrorFromResponse(400, {
        code: 'VALIDATION_ERROR',
        message: 'Invalid',
        details: [{ path: 'email', message: 'Required' }],
      });
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).validationErrors).toHaveLength(1);
    });

    it('should create ConflictError for 409', () => {
      const error = createErrorFromResponse(409, { message: 'Duplicate' });
      expect(error).toBeInstanceOf(ConflictError);
    });

    it('should create RateLimitError for 429', () => {
      const headers = new Headers({
        'Retry-After': '60',
        'X-RateLimit-Limit': '100',
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': '1704067200',
      });
      const error = createErrorFromResponse(
        429,
        { message: 'Rate limited', retryAfter: 60 },
        headers
      );
      expect(error).toBeInstanceOf(RateLimitError);
      expect((error as RateLimitError).retryAfter).toBe(60);
    });

    it('should create ServerError for 500', () => {
      const error = createErrorFromResponse(500, { message: 'Server error' });
      expect(error).toBeInstanceOf(ServerError);
    });

    it('should create ServiceUnavailableError for 503', () => {
      const headers = new Headers({ 'Retry-After': '300' });
      const error = createErrorFromResponse(503, { message: 'Unavailable' }, headers);
      expect(error).toBeInstanceOf(ServiceUnavailableError);
    });

    it('should create generic MailQueueError for unknown status', () => {
      const error = createErrorFromResponse(418, { code: 'TEAPOT', message: 'I am a teapot' });
      expect(error).toBeInstanceOf(MailQueueError);
      expect(error.code).toBe('TEAPOT');
    });
  });
});
