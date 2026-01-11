import type { HttpClient } from '../http-client.js';
import type {
  Email,
  EmailEvent,
  SendEmailParams,
  SendBatchEmailParams,
  BatchEmailResponse,
  ListEmailsParams,
  PaginatedResponse,
} from '../types.js';

/**
 * Resource for managing emails
 */
export class EmailsResource {
  constructor(private readonly client: HttpClient) {}

  /**
   * Send a single email
   *
   * @example
   * ```typescript
   * const email = await mq.emails.send({
   *   queue: 'transactional',
   *   from: { email: 'noreply@example.com', name: 'My App' },
   *   to: [{ email: 'user@example.com' }],
   *   subject: 'Welcome!',
   *   html: '<h1>Hello!</h1>',
   * });
   * console.log(email.id);
   * ```
   */
  async send(params: SendEmailParams): Promise<Email> {
    return this.client.post<Email>(
      '/emails',
      {
        queue: params.queue,
        from: params.from,
        to: params.to,
        cc: params.cc,
        bcc: params.bcc,
        replyTo: params.replyTo,
        subject: params.subject,
        html: params.html,
        text: params.text,
        headers: params.headers,
        personalizations: params.personalizations,
        metadata: params.metadata,
        scheduledAt: params.scheduledAt,
      },
      { idempotencyKey: params.idempotencyKey }
    );
  }

  /**
   * Send a batch of emails to multiple recipients
   *
   * @example
   * ```typescript
   * const result = await mq.emails.sendBatch({
   *   queue: 'newsletter',
   *   from: { email: 'newsletter@example.com' },
   *   emails: [
   *     { to: 'user1@example.com', personalizations: { name: 'User 1' } },
   *     { to: 'user2@example.com', personalizations: { name: 'User 2' } },
   *   ],
   *   subject: 'Hello {{name}}!',
   *   html: '<p>Welcome, {{name}}!</p>',
   * });
   * console.log(`Queued: ${result.queuedCount}/${result.totalCount}`);
   * ```
   */
  async sendBatch(params: SendBatchEmailParams): Promise<BatchEmailResponse> {
    return this.client.post<BatchEmailResponse>('/emails/batch', {
      queue: params.queue,
      from: params.from,
      emails: params.emails,
      replyTo: params.replyTo,
      subject: params.subject,
      html: params.html,
      text: params.text,
      headers: params.headers,
      scheduledAt: params.scheduledAt,
    });
  }

  /**
   * Get an email by ID
   *
   * @example
   * ```typescript
   * const email = await mq.emails.get('email-uuid');
   * console.log(email.status); // 'delivered'
   * ```
   */
  async get(id: string): Promise<Email> {
    return this.client.get<Email>(`/emails/${id}`);
  }

  /**
   * List emails with optional filters
   *
   * @example
   * ```typescript
   * const result = await mq.emails.list({
   *   status: 'failed',
   *   limit: 10,
   * });
   * console.log(`Found ${result.pagination.total} failed emails`);
   * ```
   */
  async list(params?: ListEmailsParams): Promise<PaginatedResponse<Email>> {
    return this.client.get<PaginatedResponse<Email>>('/emails', {
      status: params?.status,
      queueId: params?.queueId,
      limit: params?.limit,
      offset: params?.offset,
    });
  }

  /**
   * Get events for an email
   *
   * @example
   * ```typescript
   * const events = await mq.emails.getEvents('email-uuid');
   * for (const event of events) {
   *   console.log(`${event.eventType} at ${event.createdAt}`);
   * }
   * ```
   */
  async getEvents(id: string): Promise<EmailEvent[]> {
    return this.client.get<EmailEvent[]>(`/emails/${id}/events`);
  }

  /**
   * Cancel a scheduled email (only works for emails not yet sent)
   *
   * @example
   * ```typescript
   * await mq.emails.cancel('email-uuid');
   * console.log('Email cancelled');
   * ```
   */
  async cancel(id: string): Promise<void> {
    await this.client.delete<void>(`/emails/${id}`);
  }

  /**
   * Retry a failed email
   *
   * @example
   * ```typescript
   * const email = await mq.emails.retry('email-uuid');
   * console.log('Email requeued:', email.status);
   * ```
   */
  async retry(id: string): Promise<Email> {
    return this.client.post<Email>(`/emails/${id}/retry`);
  }
}
