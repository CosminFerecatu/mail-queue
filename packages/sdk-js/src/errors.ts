/**
 * Base error class for all Mail Queue SDK errors
 */
export class MailQueueError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'MailQueueError';
    Object.setPrototypeOf(this, MailQueueError.prototype);
  }
}

/**
 * Error thrown when authentication fails
 */
export class AuthenticationError extends MailQueueError {
  constructor(message = 'Invalid or expired API key') {
    super(message, 'AUTHENTICATION_ERROR', 401);
    this.name = 'AuthenticationError';
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

/**
 * Error thrown when authorization fails (insufficient permissions)
 */
export class AuthorizationError extends MailQueueError {
  constructor(message = 'Insufficient permissions') {
    super(message, 'AUTHORIZATION_ERROR', 403);
    this.name = 'AuthorizationError';
    Object.setPrototypeOf(this, AuthorizationError.prototype);
  }
}

/**
 * Error thrown when a requested resource is not found
 */
export class NotFoundError extends MailQueueError {
  constructor(resource: string, id?: string) {
    const message = id ? `${resource} with ID '${id}' not found` : `${resource} not found`;
    super(message, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

/**
 * Error thrown when request validation fails
 */
export class ValidationError extends MailQueueError {
  constructor(
    message: string,
    public readonly validationErrors?: Array<{ path: string; message: string }>
  ) {
    super(message, 'VALIDATION_ERROR', 400, validationErrors);
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Error thrown when rate limit is exceeded
 */
export class RateLimitError extends MailQueueError {
  constructor(
    message: string,
    public readonly retryAfter?: number,
    public readonly limit?: number,
    public readonly remaining?: number,
    public readonly resetAt?: number
  ) {
    super(message, 'RATE_LIMIT_EXCEEDED', 429);
    this.name = 'RateLimitError';
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

/**
 * Error thrown when a conflict occurs (e.g., duplicate resource)
 */
export class ConflictError extends MailQueueError {
  constructor(message: string) {
    super(message, 'CONFLICT', 409);
    this.name = 'ConflictError';
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}

/**
 * Error thrown when the server returns an internal error
 */
export class ServerError extends MailQueueError {
  constructor(message = 'Internal server error') {
    super(message, 'SERVER_ERROR', 500);
    this.name = 'ServerError';
    Object.setPrototypeOf(this, ServerError.prototype);
  }
}

/**
 * Error thrown when the service is temporarily unavailable
 */
export class ServiceUnavailableError extends MailQueueError {
  constructor(
    message = 'Service temporarily unavailable',
    public readonly retryAfter?: number
  ) {
    super(message, 'SERVICE_UNAVAILABLE', 503);
    this.name = 'ServiceUnavailableError';
    Object.setPrototypeOf(this, ServiceUnavailableError.prototype);
  }
}

/**
 * Error thrown when a network error occurs
 */
export class NetworkError extends MailQueueError {
  constructor(
    message = 'Network error occurred',
    public readonly originalError?: Error
  ) {
    super(message, 'NETWORK_ERROR');
    this.name = 'NetworkError';
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}

/**
 * Error thrown when a request times out
 */
export class TimeoutError extends MailQueueError {
  constructor(
    message = 'Request timed out',
    public readonly timeoutMs?: number
  ) {
    super(message, 'TIMEOUT');
    this.name = 'TimeoutError';
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}

/**
 * Maps API error response to appropriate error class
 */
export function createErrorFromResponse(
  statusCode: number,
  errorResponse: {
    code?: string;
    message?: string;
    details?: unknown;
    retryAfter?: number;
  },
  headers?: Headers
): MailQueueError {
  const message = errorResponse.message || 'Unknown error';
  const code = errorResponse.code || 'UNKNOWN_ERROR';

  switch (statusCode) {
    case 401:
      return new AuthenticationError(message);
    case 403:
      return new AuthorizationError(message);
    case 404:
      return new NotFoundError(message);
    case 400:
      if (code === 'VALIDATION_ERROR') {
        return new ValidationError(
          message,
          errorResponse.details as Array<{ path: string; message: string }> | undefined
        );
      }
      return new MailQueueError(message, code, statusCode, errorResponse.details);
    case 409:
      return new ConflictError(message);
    case 429: {
      const retryAfter =
        errorResponse.retryAfter || (headers ? Number(headers.get('Retry-After')) : undefined);
      const limit = headers ? Number(headers.get('X-RateLimit-Limit')) : undefined;
      const remaining = headers ? Number(headers.get('X-RateLimit-Remaining')) : undefined;
      const resetAt = headers ? Number(headers.get('X-RateLimit-Reset')) : undefined;
      return new RateLimitError(message, retryAfter, limit, remaining, resetAt);
    }
    case 500:
      return new ServerError(message);
    case 503: {
      const retryAfter = headers ? Number(headers.get('Retry-After')) : undefined;
      return new ServiceUnavailableError(message, retryAfter);
    }
    default:
      return new MailQueueError(message, code, statusCode, errorResponse.details);
  }
}
