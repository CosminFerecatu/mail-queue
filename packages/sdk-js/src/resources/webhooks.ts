import type { HttpClient } from '../http-client.js';
import type { WebhookDelivery, ListWebhookLogsParams, PaginatedResponse } from '../types.js';

/**
 * Resource for managing webhook deliveries
 */
export class WebhooksResource {
  constructor(private readonly client: HttpClient) {}

  /**
   * List webhook delivery logs
   *
   * @example
   * ```typescript
   * const result = await mq.webhooks.getLogs({
   *   status: 'failed',
   *   limit: 20,
   * });
   * for (const delivery of result.data) {
   *   console.log(`${delivery.eventType}: ${delivery.status}`);
   *   if (delivery.lastError) {
   *     console.log(`  Error: ${delivery.lastError}`);
   *   }
   * }
   * ```
   */
  async getLogs(params?: ListWebhookLogsParams): Promise<PaginatedResponse<WebhookDelivery>> {
    return this.client.get<PaginatedResponse<WebhookDelivery>>('/webhooks/logs', {
      status: params?.status,
      eventType: params?.eventType,
      limit: params?.limit,
      offset: params?.offset,
    });
  }

  /**
   * Retry a failed webhook delivery
   *
   * @example
   * ```typescript
   * const delivery = await mq.webhooks.retry('delivery-uuid');
   * console.log(`Webhook requeued: ${delivery.status}`);
   * ```
   */
  async retry(id: string): Promise<WebhookDelivery> {
    return this.client.post<WebhookDelivery>(`/webhooks/${id}/retry`);
  }
}
