import type { HttpClient } from '../http-client.js';
import type {
  Queue,
  QueueStats,
  CreateQueueParams,
  UpdateQueueParams,
  PaginationParams,
  PaginatedResponse,
} from '../types.js';

/**
 * Resource for managing email queues
 */
export class QueuesResource {
  constructor(private readonly client: HttpClient) {}

  /**
   * Create a new queue
   *
   * @example
   * ```typescript
   * const queue = await mq.queues.create({
   *   name: 'transactional',
   *   priority: 8,
   *   rateLimit: 1000, // emails per minute
   * });
   * console.log(queue.id);
   * ```
   */
  async create(params: CreateQueueParams): Promise<Queue> {
    return this.client.post<Queue>('/queues', params);
  }

  /**
   * Get a queue by ID
   *
   * @example
   * ```typescript
   * const queue = await mq.queues.get('queue-uuid');
   * console.log(queue.name);
   * ```
   */
  async get(id: string): Promise<Queue> {
    return this.client.get<Queue>(`/queues/${id}`);
  }

  /**
   * List all queues
   *
   * @example
   * ```typescript
   * const result = await mq.queues.list();
   * for (const queue of result.data) {
   *   console.log(`${queue.name}: priority ${queue.priority}`);
   * }
   * ```
   */
  async list(params?: PaginationParams): Promise<PaginatedResponse<Queue>> {
    return this.client.get<PaginatedResponse<Queue>>('/queues', {
      limit: params?.limit,
      offset: params?.offset,
    });
  }

  /**
   * Update a queue's configuration
   *
   * @example
   * ```typescript
   * const queue = await mq.queues.update('queue-uuid', {
   *   priority: 10,
   *   rateLimit: 2000,
   * });
   * ```
   */
  async update(id: string, params: UpdateQueueParams): Promise<Queue> {
    return this.client.patch<Queue>(`/queues/${id}`, params);
  }

  /**
   * Delete a queue
   *
   * @example
   * ```typescript
   * await mq.queues.delete('queue-uuid');
   * console.log('Queue deleted');
   * ```
   */
  async delete(id: string): Promise<void> {
    await this.client.delete<void>(`/queues/${id}`);
  }

  /**
   * Pause a queue (stops processing new emails)
   *
   * @example
   * ```typescript
   * await mq.queues.pause('queue-uuid');
   * console.log('Queue paused');
   * ```
   */
  async pause(id: string): Promise<Queue> {
    return this.client.post<Queue>(`/queues/${id}/pause`);
  }

  /**
   * Resume a paused queue
   *
   * @example
   * ```typescript
   * await mq.queues.resume('queue-uuid');
   * console.log('Queue resumed');
   * ```
   */
  async resume(id: string): Promise<Queue> {
    return this.client.post<Queue>(`/queues/${id}/resume`);
  }

  /**
   * Get queue statistics
   *
   * @example
   * ```typescript
   * const stats = await mq.queues.getStats('queue-uuid');
   * console.log(`Pending: ${stats.pending}, Processing: ${stats.processing}`);
   * console.log(`Throughput last hour: ${stats.throughput.lastHour}`);
   * ```
   */
  async getStats(id: string): Promise<QueueStats> {
    return this.client.get<QueueStats>(`/queues/${id}/stats`);
  }
}
