// Main client
export { MailQueue } from './client.js';

// Types
export type {
  // Configuration
  MailQueueConfig,
  // Common
  EmailAddress,
  PaginationParams,
  PaginatedResponse,
  ApiResponse,
  ApiErrorResponse,
  // Email
  EmailStatus,
  EmailEventType,
  SendEmailParams,
  BatchRecipient,
  SendBatchEmailParams,
  Email,
  EmailEvent,
  BatchEmailResponse,
  ListEmailsParams,
  // Queue
  QueueSettings,
  Queue,
  CreateQueueParams,
  UpdateQueueParams,
  QueueStats,
  // Analytics
  AnalyticsTimeRange,
  AnalyticsParams,
  AnalyticsOverview,
  DeliveryMetricsPoint,
  DeliveryMetrics,
  EngagementMetricsPoint,
  EngagementMetrics,
  BounceBreakdown,
  ReputationScore,
  // Suppression
  SuppressionReason,
  SuppressionEntry,
  CreateSuppressionParams,
  BulkSuppressionParams,
  SuppressionCheckResult,
  ListSuppressionsParams,
  // SMTP
  SmtpEncryption,
  SmtpConfig,
  CreateSmtpConfigParams,
  UpdateSmtpConfigParams,
  SmtpTestResult,
  // API Keys
  ApiKeyScope,
  ApiKey,
  ApiKeyWithSecret,
  CreateApiKeyParams,
  // Webhooks
  WebhookEventType,
  WebhookDeliveryStatus,
  WebhookDelivery,
  ListWebhookLogsParams,
  // App
  AppSettings,
  App,
} from './types.js';

// Errors
export {
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
} from './errors.js';

// Resources (for advanced usage)
export {
  EmailsResource,
  QueuesResource,
  AnalyticsResource,
  SuppressionResource,
  SmtpConfigsResource,
  ApiKeysResource,
  WebhooksResource,
} from './resources/index.js';
