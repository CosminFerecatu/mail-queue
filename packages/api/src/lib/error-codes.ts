/**
 * Centralized error codes for consistent API error responses.
 *
 * All error codes used across the API routes are defined here
 * to ensure consistency and type safety.
 */
export const ErrorCodes = {
  // Authentication errors
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',

  // Authorization errors
  FORBIDDEN: 'FORBIDDEN',
  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',

  // Resource errors
  NOT_FOUND: 'NOT_FOUND',
  USER_NOT_FOUND: 'USER_NOT_FOUND',

  // Validation errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  BAD_REQUEST: 'BAD_REQUEST',

  // Rate limiting
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',

  // Business logic errors
  QUEUE_PAUSED: 'QUEUE_PAUSED',
  LIMIT_EXCEEDED: 'LIMIT_EXCEEDED',
  DUPLICATE_QUEUE: 'DUPLICATE_QUEUE',
  INVALID_SMTP_CONFIG: 'INVALID_SMTP_CONFIG',
  RETRY_FAILED: 'RETRY_FAILED',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',

  // Server errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * Standard error messages for common error codes.
 * These can be used as defaults when a more specific message is not available.
 */
export const ErrorMessages: Record<ErrorCode, string> = {
  [ErrorCodes.UNAUTHORIZED]: 'Authentication required',
  [ErrorCodes.INVALID_TOKEN]: 'Invalid or expired token',
  [ErrorCodes.INVALID_CREDENTIALS]: 'Invalid credentials',
  [ErrorCodes.FORBIDDEN]: 'You do not have permission to perform this action',
  [ErrorCodes.ACCOUNT_DISABLED]: 'Account has been disabled',
  [ErrorCodes.NOT_FOUND]: 'Resource not found',
  [ErrorCodes.USER_NOT_FOUND]: 'User not found',
  [ErrorCodes.VALIDATION_ERROR]: 'Invalid request data',
  [ErrorCodes.BAD_REQUEST]: 'Bad request',
  [ErrorCodes.RATE_LIMIT_EXCEEDED]: 'Rate limit exceeded',
  [ErrorCodes.QUEUE_PAUSED]: 'Queue is paused',
  [ErrorCodes.LIMIT_EXCEEDED]: 'Resource limit exceeded',
  [ErrorCodes.DUPLICATE_QUEUE]: 'A queue with this name already exists',
  [ErrorCodes.INVALID_SMTP_CONFIG]: 'Invalid SMTP configuration',
  [ErrorCodes.RETRY_FAILED]: 'Retry operation failed',
  [ErrorCodes.IDEMPOTENCY_CONFLICT]: 'Idempotency conflict',
  [ErrorCodes.INTERNAL_ERROR]: 'Internal server error',
};
