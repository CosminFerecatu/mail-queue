/**
 * Custom error classes for Mail Queue
 */

// ===========================================
// Base Error
// ===========================================

export abstract class MailQueueError extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;
  readonly details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

// ===========================================
// Authentication Errors (401)
// ===========================================

export class AuthenticationError extends MailQueueError {
  readonly code: string = 'AUTHENTICATION_ERROR';
  readonly statusCode = 401;
}

export class InvalidApiKeyError extends AuthenticationError {
  override readonly code = 'INVALID_API_KEY';
}

export class ExpiredApiKeyError extends AuthenticationError {
  override readonly code = 'EXPIRED_API_KEY';
}

export class InvalidTokenError extends AuthenticationError {
  override readonly code = 'INVALID_TOKEN';
}

export class ExpiredTokenError extends AuthenticationError {
  override readonly code = 'EXPIRED_TOKEN';
}

// ===========================================
// Authorization Errors (403)
// ===========================================

export class AuthorizationError extends MailQueueError {
  readonly code: string = 'AUTHORIZATION_ERROR';
  readonly statusCode = 403;
}

export class InsufficientScopeError extends AuthorizationError {
  override readonly code = 'INSUFFICIENT_SCOPE';

  constructor(requiredScope: string) {
    super(`Required scope: ${requiredScope}`, { requiredScope });
  }
}

export class IpNotAllowedError extends AuthorizationError {
  override readonly code = 'IP_NOT_ALLOWED';

  constructor(ipAddress: string) {
    super(`IP address not in allowlist: ${ipAddress}`, { ipAddress });
  }
}

export class AppInactiveError extends AuthorizationError {
  override readonly code = 'APP_INACTIVE';

  constructor() {
    super('App is inactive');
  }
}

// ===========================================
// Not Found Errors (404)
// ===========================================

export class NotFoundError extends MailQueueError {
  readonly code: string = 'NOT_FOUND';
  readonly statusCode = 404;
}

export class AppNotFoundError extends NotFoundError {
  override readonly code = 'APP_NOT_FOUND';

  constructor(appId?: string) {
    super(`App not found${appId ? `: ${appId}` : ''}`, appId ? { appId } : undefined);
  }
}

export class QueueNotFoundError extends NotFoundError {
  override readonly code = 'QUEUE_NOT_FOUND';

  constructor(queueName?: string) {
    super(
      `Queue not found${queueName ? `: ${queueName}` : ''}`,
      queueName ? { queueName } : undefined
    );
  }
}

export class EmailNotFoundError extends NotFoundError {
  override readonly code = 'EMAIL_NOT_FOUND';

  constructor(emailId?: string) {
    super(`Email not found${emailId ? `: ${emailId}` : ''}`, emailId ? { emailId } : undefined);
  }
}

export class SmtpConfigNotFoundError extends NotFoundError {
  override readonly code = 'SMTP_CONFIG_NOT_FOUND';

  constructor(configId?: string) {
    super(
      `SMTP config not found${configId ? `: ${configId}` : ''}`,
      configId ? { configId } : undefined
    );
  }
}

// ===========================================
// Validation Errors (400)
// ===========================================

export class ValidationError extends MailQueueError {
  readonly code: string = 'VALIDATION_ERROR';
  readonly statusCode = 400;
  readonly errors: Array<{ path: string; message: string }>;

  constructor(errors: Array<{ path: string; message: string }>) {
    super('Validation failed', { errors });
    this.errors = errors;
  }
}

export class InvalidEmailError extends ValidationError {
  override readonly code = 'INVALID_EMAIL';

  constructor(email: string, reason: string) {
    super([{ path: 'email', message: `Invalid email address "${email}": ${reason}` }]);
  }
}

export class SuppressedEmailError extends MailQueueError {
  readonly code = 'EMAIL_SUPPRESSED';
  readonly statusCode = 400;

  constructor(email: string, reason: string) {
    super(`Email address is suppressed: ${email}`, { email, reason });
  }
}

// ===========================================
// Conflict Errors (409)
// ===========================================

export class ConflictError extends MailQueueError {
  readonly code: string = 'CONFLICT';
  readonly statusCode = 409;
}

export class DuplicateQueueError extends ConflictError {
  override readonly code = 'DUPLICATE_QUEUE';

  constructor(queueName: string) {
    super(`Queue already exists: ${queueName}`, { queueName });
  }
}

export class IdempotencyConflictError extends ConflictError {
  override readonly code = 'IDEMPOTENCY_CONFLICT';

  constructor(idempotencyKey: string, existingEmailId: string) {
    super('Request with idempotency key already processed', {
      idempotencyKey,
      existingEmailId,
    });
  }
}

// ===========================================
// Rate Limit Errors (429)
// ===========================================

export class RateLimitError extends MailQueueError {
  readonly code: string = 'RATE_LIMIT_EXCEEDED';
  readonly statusCode = 429;
  readonly retryAfter: number;

  constructor(retryAfter: number, limit: number, remaining: number) {
    super(`Rate limit exceeded. Retry after ${retryAfter} seconds`, {
      retryAfter,
      limit,
      remaining,
    });
    this.retryAfter = retryAfter;
  }
}

export class DailyLimitError extends RateLimitError {
  override readonly code = 'DAILY_LIMIT_EXCEEDED';

  constructor(limit: number) {
    // Retry after midnight
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const retryAfter = Math.ceil((midnight.getTime() - now.getTime()) / 1000);
    super(retryAfter, limit, 0);
  }
}

export class MonthlyLimitError extends RateLimitError {
  override readonly code = 'MONTHLY_LIMIT_EXCEEDED';

  constructor(limit: number) {
    // Retry after first of next month
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const retryAfter = Math.ceil((nextMonth.getTime() - now.getTime()) / 1000);
    super(retryAfter, limit, 0);
  }
}

// ===========================================
// Server Errors (500)
// ===========================================

export class InternalError extends MailQueueError {
  readonly code: string = 'INTERNAL_ERROR';
  readonly statusCode = 500;
}

export class SmtpError extends MailQueueError {
  readonly code = 'SMTP_ERROR';
  readonly statusCode = 502;
  readonly smtpCode?: string;

  constructor(message: string, smtpCode?: string) {
    super(message, smtpCode ? { smtpCode } : undefined);
    this.smtpCode = smtpCode;
  }
}

export class DatabaseError extends InternalError {
  override readonly code = 'DATABASE_ERROR';
}

export class QueueError extends InternalError {
  override readonly code = 'QUEUE_ERROR';
}

// ===========================================
// Service Unavailable (503)
// ===========================================

export class ServiceUnavailableError extends MailQueueError {
  readonly code: string = 'SERVICE_UNAVAILABLE';
  readonly statusCode = 503;
}

export class QueuePausedError extends ServiceUnavailableError {
  override readonly code = 'QUEUE_PAUSED';

  constructor(queueName: string) {
    super(`Queue is paused: ${queueName}`, { queueName });
  }
}

// ===========================================
// Error Type Guards
// ===========================================

export function isMailQueueError(error: unknown): error is MailQueueError {
  return error instanceof MailQueueError;
}

export function isAuthenticationError(error: unknown): error is AuthenticationError {
  return error instanceof AuthenticationError;
}

export function isAuthorizationError(error: unknown): error is AuthorizationError {
  return error instanceof AuthorizationError;
}

export function isNotFoundError(error: unknown): error is NotFoundError {
  return error instanceof NotFoundError;
}

export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}

export function isRateLimitError(error: unknown): error is RateLimitError {
  return error instanceof RateLimitError;
}
