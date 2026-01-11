// ===========================================
// SDK Configuration
// ===========================================

export interface MailQueueConfig {
  /** API key for authentication (required) */
  apiKey: string;
  /** Base URL of the Mail Queue API (default: https://api.mailqueue.io) */
  baseUrl?: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Retry configuration */
  retry?: {
    /** Maximum number of retries (default: 3) */
    maxRetries?: number;
    /** Initial delay between retries in ms (default: 1000) */
    initialDelay?: number;
    /** Maximum delay between retries in ms (default: 30000) */
    maxDelay?: number;
    /** Multiplier for exponential backoff (default: 2) */
    backoffMultiplier?: number;
  };
  /** Custom headers to include in all requests */
  headers?: Record<string, string>;
}

// ===========================================
// Common Types
// ===========================================

export interface EmailAddress {
  email: string;
  name?: string;
}

export interface PaginationParams {
  limit?: number;
  offset?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// ===========================================
// Email Types
// ===========================================

export type EmailStatus =
  | 'queued'
  | 'processing'
  | 'sent'
  | 'delivered'
  | 'bounced'
  | 'failed'
  | 'cancelled';

export type EmailEventType =
  | 'queued'
  | 'processing'
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'bounced'
  | 'complained'
  | 'unsubscribed';

export interface SendEmailParams {
  /** Queue name to use */
  queue: string;
  /** Sender email address */
  from: EmailAddress;
  /** Recipients */
  to: EmailAddress[];
  /** CC recipients */
  cc?: EmailAddress[];
  /** BCC recipients */
  bcc?: EmailAddress[];
  /** Reply-to address */
  replyTo?: string;
  /** Email subject */
  subject: string;
  /** HTML body */
  html?: string;
  /** Plain text body */
  text?: string;
  /** Custom headers */
  headers?: Record<string, string>;
  /** Personalization data for template variables */
  personalizations?: Record<string, unknown>;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
  /** Schedule email for later */
  scheduledAt?: string;
  /** Idempotency key to prevent duplicates */
  idempotencyKey?: string;
}

export interface BatchRecipient {
  /** Recipient email (string or EmailAddress object) */
  to: string | EmailAddress;
  /** CC recipients for this specific email */
  cc?: EmailAddress[];
  /** BCC recipients for this specific email */
  bcc?: EmailAddress[];
  /** Personalization data for this recipient */
  personalizations?: Record<string, unknown>;
  /** Custom metadata for this recipient */
  metadata?: Record<string, unknown>;
}

export interface SendBatchEmailParams {
  /** Queue name to use */
  queue: string;
  /** Sender email address */
  from: EmailAddress;
  /** List of recipients with optional per-recipient data */
  emails: BatchRecipient[];
  /** Reply-to address */
  replyTo?: string;
  /** Email subject (can use {{variable}} placeholders) */
  subject: string;
  /** HTML body (can use {{variable}} placeholders) */
  html?: string;
  /** Plain text body (can use {{variable}} placeholders) */
  text?: string;
  /** Custom headers */
  headers?: Record<string, string>;
  /** Schedule emails for later */
  scheduledAt?: string;
}

export interface Email {
  id: string;
  queueId: string;
  queueName: string;
  messageId: string | null;
  from: EmailAddress;
  to: EmailAddress[];
  subject: string;
  status: EmailStatus;
  retryCount: number;
  lastError: string | null;
  scheduledAt: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  metadata: Record<string, unknown> | null;
}

export interface EmailEvent {
  id: string;
  emailId: string;
  eventType: EmailEventType;
  eventData: {
    linkUrl?: string;
    userAgent?: string;
    ipAddress?: string;
    bounceType?: 'hard' | 'soft';
    bounceSubType?: string;
    bounceMessage?: string;
    complaintType?: string;
  } | null;
  createdAt: string;
}

export interface BatchEmailResponse {
  batchId: string;
  totalCount: number;
  queuedCount: number;
  failedCount: number;
  emailIds: string[];
  errors?: Array<{
    index: number;
    error: string;
  }>;
}

export interface ListEmailsParams extends PaginationParams {
  status?: EmailStatus;
  queueId?: string;
}

// ===========================================
// Queue Types
// ===========================================

export interface QueueSettings {
  enableOpenTracking?: boolean;
  enableClickTracking?: boolean;
  addUnsubscribeHeader?: boolean;
}

export interface Queue {
  id: string;
  appId: string;
  name: string;
  priority: number;
  rateLimit: number | null;
  maxRetries: number;
  retryDelay: number[];
  smtpConfigId: string | null;
  isPaused: boolean;
  settings: QueueSettings | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateQueueParams {
  /** Queue name (lowercase alphanumeric with hyphens) */
  name: string;
  /** Priority level 1-10 (default: 5) */
  priority?: number;
  /** Rate limit in emails per minute */
  rateLimit?: number;
  /** Maximum retry attempts (default: 5) */
  maxRetries?: number;
  /** Retry delays in seconds */
  retryDelay?: number[];
  /** SMTP configuration ID to use */
  smtpConfigId?: string;
  /** Queue settings */
  settings?: QueueSettings;
}

export interface UpdateQueueParams {
  priority?: number;
  rateLimit?: number;
  maxRetries?: number;
  retryDelay?: number[];
  smtpConfigId?: string;
  settings?: QueueSettings;
}

export interface QueueStats {
  queueId: string;
  queueName: string;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  delayed: number;
  isPaused: boolean;
  throughput: {
    lastMinute: number;
    lastHour: number;
    lastDay: number;
  };
}

// ===========================================
// Analytics Types
// ===========================================

export interface AnalyticsTimeRange {
  from?: string;
  to?: string;
}

export interface AnalyticsParams extends AnalyticsTimeRange {
  queueId?: string;
  granularity?: 'minute' | 'hour' | 'day';
}

export interface AnalyticsOverview {
  period: {
    from: string;
    to: string;
  };
  totals: {
    sent: number;
    delivered: number;
    bounced: number;
    complained: number;
    failed: number;
  };
  rates: {
    deliveryRate: number;
    bounceRate: number;
    complaintRate: number;
  };
  queues: {
    pending: number;
    processing: number;
  };
}

export interface DeliveryMetricsPoint {
  timestamp: string;
  sent: number;
  delivered: number;
  bounced: number;
  failed: number;
}

export interface DeliveryMetrics {
  period: {
    from: string;
    to: string;
  };
  granularity: 'minute' | 'hour' | 'day';
  data: DeliveryMetricsPoint[];
  totals: {
    sent: number;
    delivered: number;
    bounced: number;
    failed: number;
  };
}

export interface EngagementMetricsPoint {
  timestamp: string;
  delivered: number;
  opened: number;
  clicked: number;
  unsubscribed: number;
}

export interface EngagementMetrics {
  period: {
    from: string;
    to: string;
  };
  granularity: 'minute' | 'hour' | 'day';
  data: EngagementMetricsPoint[];
  totals: {
    delivered: number;
    opened: number;
    clicked: number;
    unsubscribed: number;
  };
  rates: {
    openRate: number;
    clickRate: number;
    unsubscribeRate: number;
  };
}

export interface BounceBreakdown {
  period: {
    from: string;
    to: string;
  };
  totalBounces: number;
  byType: {
    hard: number;
    soft: number;
  };
  byReason: Array<{
    reason: string;
    count: number;
    percentage: number;
  }>;
  topBouncedDomains: Array<{
    domain: string;
    count: number;
    percentage: number;
  }>;
}

export interface ReputationScore {
  appId: string;
  score: number;
  bounceRate24h: number;
  complaintRate24h: number;
  isThrottled: boolean;
  throttleReason: string | null;
  updatedAt: string;
  recommendations: string[];
}

// ===========================================
// Suppression Types
// ===========================================

export type SuppressionReason =
  | 'hard_bounce'
  | 'soft_bounce'
  | 'complaint'
  | 'unsubscribe'
  | 'manual';

export interface SuppressionEntry {
  id: string;
  appId: string | null;
  emailAddress: string;
  reason: SuppressionReason;
  sourceEmailId: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface CreateSuppressionParams {
  emailAddress: string;
  reason?: SuppressionReason;
  expiresAt?: string;
}

export interface BulkSuppressionParams {
  emailAddresses: string[];
  reason?: SuppressionReason;
  expiresAt?: string;
}

export interface SuppressionCheckResult {
  emailAddress: string;
  isSuppressed: boolean;
  reason: SuppressionReason | null;
  scope: 'global' | 'app' | null;
  expiresAt: string | null;
}

export interface ListSuppressionsParams extends PaginationParams {
  reason?: SuppressionReason;
}

// ===========================================
// SMTP Config Types
// ===========================================

export type SmtpEncryption = 'tls' | 'starttls' | 'none';

export interface SmtpConfig {
  id: string;
  appId: string;
  name: string;
  host: string;
  port: number;
  username: string | null;
  encryption: SmtpEncryption;
  poolSize: number;
  timeoutMs: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSmtpConfigParams {
  name: string;
  host: string;
  port: number;
  username?: string;
  password?: string;
  encryption?: SmtpEncryption;
  poolSize?: number;
  timeoutMs?: number;
}

export interface UpdateSmtpConfigParams {
  name?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  encryption?: SmtpEncryption;
  poolSize?: number;
  timeoutMs?: number;
}

export interface SmtpTestResult {
  success: boolean;
  latencyMs: number;
  error?: string;
}

// ===========================================
// API Key Types
// ===========================================

export type ApiKeyScope =
  | 'email:send'
  | 'email:read'
  | 'queue:manage'
  | 'smtp:manage'
  | 'analytics:read'
  | 'suppression:manage'
  | 'admin';

export interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: ApiKeyScope[];
  rateLimit: number | null;
  ipAllowlist: string[] | null;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface ApiKeyWithSecret extends ApiKey {
  key: string;
}

export interface CreateApiKeyParams {
  name: string;
  scopes: ApiKeyScope[];
  rateLimit?: number;
  ipAllowlist?: string[];
  expiresAt?: string;
}

// ===========================================
// Webhook Types
// ===========================================

export type WebhookEventType =
  | 'email.queued'
  | 'email.sent'
  | 'email.delivered'
  | 'email.bounced'
  | 'email.complained'
  | 'email.opened'
  | 'email.clicked'
  | 'email.unsubscribed'
  | 'email.failed';

export type WebhookDeliveryStatus = 'pending' | 'delivered' | 'failed';

export interface WebhookDelivery {
  id: string;
  appId: string;
  emailId: string | null;
  eventType: string;
  payload: Record<string, unknown>;
  status: WebhookDeliveryStatus;
  attempts: number;
  lastError: string | null;
  nextRetryAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

export interface ListWebhookLogsParams extends PaginationParams {
  status?: WebhookDeliveryStatus;
  eventType?: WebhookEventType;
}

// ===========================================
// App Types
// ===========================================

export interface AppSettings {
  defaultFromEmail?: string;
  defaultFromName?: string;
  maxEmailsPerBatch?: number;
  retentionDays?: number;
}

export interface App {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  sandboxMode: boolean;
  webhookUrl: string | null;
  dailyLimit: number | null;
  monthlyLimit: number | null;
  settings: AppSettings | null;
  createdAt: string;
  updatedAt: string;
}
