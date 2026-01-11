import type { HttpClient } from '../http-client.js';
import type {
  SuppressionEntry,
  SuppressionCheckResult,
  CreateSuppressionParams,
  BulkSuppressionParams,
  ListSuppressionsParams,
  PaginatedResponse,
} from '../types.js';

/**
 * Resource for managing email suppression lists
 */
export class SuppressionResource {
  constructor(private readonly client: HttpClient) {}

  /**
   * Add an email to the suppression list
   *
   * @example
   * ```typescript
   * const entry = await mq.suppression.add({
   *   emailAddress: 'unsubscribed@example.com',
   *   reason: 'unsubscribe',
   * });
   * console.log(`Added ${entry.emailAddress} to suppression list`);
   * ```
   */
  async add(params: CreateSuppressionParams): Promise<SuppressionEntry> {
    return this.client.post<SuppressionEntry>('/suppression', params);
  }

  /**
   * Add multiple emails to the suppression list
   *
   * @example
   * ```typescript
   * const result = await mq.suppression.addBulk({
   *   emailAddresses: ['user1@example.com', 'user2@example.com'],
   *   reason: 'manual',
   * });
   * console.log(`Added ${result.addedCount} addresses`);
   * ```
   */
  async addBulk(
    params: BulkSuppressionParams
  ): Promise<{ addedCount: number; skippedCount: number }> {
    return this.client.post<{ addedCount: number; skippedCount: number }>(
      '/suppression/bulk',
      params
    );
  }

  /**
   * List suppressed emails
   *
   * @example
   * ```typescript
   * const result = await mq.suppression.list({
   *   reason: 'hard_bounce',
   *   limit: 50,
   * });
   * for (const entry of result.data) {
   *   console.log(`${entry.emailAddress}: ${entry.reason}`);
   * }
   * ```
   */
  async list(params?: ListSuppressionsParams): Promise<PaginatedResponse<SuppressionEntry>> {
    return this.client.get<PaginatedResponse<SuppressionEntry>>('/suppression', {
      reason: params?.reason,
      limit: params?.limit,
      offset: params?.offset,
    });
  }

  /**
   * Check if an email is suppressed
   *
   * @example
   * ```typescript
   * const result = await mq.suppression.check('user@example.com');
   * if (result.isSuppressed) {
   *   console.log(`Suppressed due to: ${result.reason}`);
   * }
   * ```
   */
  async check(emailAddress: string): Promise<SuppressionCheckResult> {
    return this.client.get<SuppressionCheckResult>(
      `/suppression/check/${encodeURIComponent(emailAddress)}`
    );
  }

  /**
   * Check multiple emails for suppression
   *
   * @example
   * ```typescript
   * const results = await mq.suppression.checkBulk([
   *   'user1@example.com',
   *   'user2@example.com',
   * ]);
   * for (const result of results) {
   *   if (result.isSuppressed) {
   *     console.log(`${result.emailAddress} is suppressed`);
   *   }
   * }
   * ```
   */
  async checkBulk(emailAddresses: string[]): Promise<SuppressionCheckResult[]> {
    return this.client.post<SuppressionCheckResult[]>('/suppression/check', {
      emailAddresses,
    });
  }

  /**
   * Remove an email from the suppression list
   *
   * @example
   * ```typescript
   * await mq.suppression.remove('user@example.com');
   * console.log('Email removed from suppression list');
   * ```
   */
  async remove(emailAddress: string): Promise<void> {
    await this.client.delete<void>(`/suppression/${encodeURIComponent(emailAddress)}`);
  }
}
