import type { MailQueueConfig } from './types.js';
import { HttpClient } from './http-client.js';
import {
  EmailsResource,
  QueuesResource,
  AnalyticsResource,
  SuppressionResource,
  SmtpConfigsResource,
  ApiKeysResource,
  WebhooksResource,
} from './resources/index.js';

/**
 * Mail Queue SDK Client
 *
 * Main entry point for interacting with the Mail Queue API.
 *
 * @example
 * ```typescript
 * import { MailQueue } from '@mail-queue/sdk';
 *
 * const mq = new MailQueue({
 *   apiKey: 'mq_live_abc123...',
 *   baseUrl: 'https://api.mailqueue.io', // optional
 * });
 *
 * // Send an email
 * const email = await mq.emails.send({
 *   queue: 'transactional',
 *   from: { email: 'noreply@example.com', name: 'My App' },
 *   to: [{ email: 'user@example.com' }],
 *   subject: 'Welcome!',
 *   html: '<h1>Hello!</h1>',
 * });
 *
 * // Check analytics
 * const overview = await mq.analytics.getOverview();
 * console.log(`Delivery rate: ${overview.rates.deliveryRate}%`);
 * ```
 */
export class MailQueue {
  private readonly client: HttpClient;

  /**
   * Email sending and management
   *
   * @example
   * ```typescript
   * // Send single email
   * await mq.emails.send({ ... });
   *
   * // Send batch
   * await mq.emails.sendBatch({ ... });
   *
   * // Get email status
   * const email = await mq.emails.get('email-id');
   *
   * // List emails
   * const result = await mq.emails.list({ status: 'failed' });
   *
   * // Get events
   * const events = await mq.emails.getEvents('email-id');
   *
   * // Cancel scheduled email
   * await mq.emails.cancel('email-id');
   *
   * // Retry failed email
   * await mq.emails.retry('email-id');
   * ```
   */
  public readonly emails: EmailsResource;

  /**
   * Queue management
   *
   * @example
   * ```typescript
   * // Create queue
   * const queue = await mq.queues.create({
   *   name: 'transactional',
   *   priority: 8,
   * });
   *
   * // List queues
   * const result = await mq.queues.list();
   *
   * // Update queue
   * await mq.queues.update('queue-id', { rateLimit: 1000 });
   *
   * // Pause/resume
   * await mq.queues.pause('queue-id');
   * await mq.queues.resume('queue-id');
   *
   * // Get stats
   * const stats = await mq.queues.getStats('queue-id');
   * ```
   */
  public readonly queues: QueuesResource;

  /**
   * Analytics and metrics
   *
   * @example
   * ```typescript
   * // Overview
   * const overview = await mq.analytics.getOverview({
   *   from: '2024-01-01T00:00:00Z',
   *   to: '2024-01-31T23:59:59Z',
   * });
   *
   * // Delivery metrics (time-series)
   * const delivery = await mq.analytics.getDeliveryMetrics({
   *   granularity: 'day',
   * });
   *
   * // Engagement metrics
   * const engagement = await mq.analytics.getEngagementMetrics();
   *
   * // Bounce breakdown
   * const bounces = await mq.analytics.getBounceBreakdown();
   *
   * // Reputation score
   * const reputation = await mq.analytics.getReputation();
   * ```
   */
  public readonly analytics: AnalyticsResource;

  /**
   * Suppression list management
   *
   * @example
   * ```typescript
   * // Add to suppression list
   * await mq.suppression.add({
   *   emailAddress: 'bounce@example.com',
   *   reason: 'hard_bounce',
   * });
   *
   * // Check if suppressed
   * const result = await mq.suppression.check('user@example.com');
   *
   * // List suppressed emails
   * const list = await mq.suppression.list({ reason: 'complaint' });
   *
   * // Remove from suppression
   * await mq.suppression.remove('user@example.com');
   * ```
   */
  public readonly suppression: SuppressionResource;

  /**
   * SMTP configuration management
   *
   * @example
   * ```typescript
   * // Create SMTP config
   * const config = await mq.smtpConfigs.create({
   *   name: 'Primary',
   *   host: 'smtp.example.com',
   *   port: 587,
   *   username: 'user',
   *   password: 'secret',
   * });
   *
   * // Test connection
   * const test = await mq.smtpConfigs.test(config.id);
   *
   * // List configs
   * const configs = await mq.smtpConfigs.list();
   * ```
   */
  public readonly smtpConfigs: SmtpConfigsResource;

  /**
   * API key management
   *
   * @example
   * ```typescript
   * // Create API key
   * const key = await mq.apiKeys.create({
   *   name: 'Production',
   *   scopes: ['email:send', 'email:read'],
   * });
   * console.log(key.key); // Store this securely!
   *
   * // List keys
   * const keys = await mq.apiKeys.list();
   *
   * // Rotate key
   * const newKey = await mq.apiKeys.rotate('key-id');
   *
   * // Revoke key
   * await mq.apiKeys.delete('key-id');
   * ```
   */
  public readonly apiKeys: ApiKeysResource;

  /**
   * Webhook delivery management
   *
   * @example
   * ```typescript
   * // Get webhook logs
   * const logs = await mq.webhooks.getLogs({
   *   status: 'failed',
   * });
   *
   * // Retry failed webhook
   * await mq.webhooks.retry('delivery-id');
   * ```
   */
  public readonly webhooks: WebhooksResource;

  /**
   * Create a new Mail Queue client
   *
   * @param config - Configuration options
   * @throws {Error} If API key is not provided
   */
  constructor(config: MailQueueConfig) {
    this.client = new HttpClient(config);

    this.emails = new EmailsResource(this.client);
    this.queues = new QueuesResource(this.client);
    this.analytics = new AnalyticsResource(this.client);
    this.suppression = new SuppressionResource(this.client);
    this.smtpConfigs = new SmtpConfigsResource(this.client);
    this.apiKeys = new ApiKeysResource(this.client);
    this.webhooks = new WebhooksResource(this.client);
  }
}
