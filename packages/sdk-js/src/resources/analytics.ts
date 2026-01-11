import type { HttpClient } from '../http-client.js';
import type {
  AnalyticsOverview,
  AnalyticsParams,
  AnalyticsTimeRange,
  DeliveryMetrics,
  EngagementMetrics,
  BounceBreakdown,
  ReputationScore,
} from '../types.js';

/**
 * Resource for accessing analytics data
 */
export class AnalyticsResource {
  constructor(private readonly client: HttpClient) {}

  /**
   * Get analytics overview
   *
   * @example
   * ```typescript
   * const overview = await mq.analytics.getOverview({
   *   from: '2024-01-01T00:00:00Z',
   *   to: '2024-01-31T23:59:59Z',
   * });
   * console.log(`Delivery rate: ${overview.rates.deliveryRate}%`);
   * ```
   */
  async getOverview(
    params?: AnalyticsTimeRange & { queueId?: string }
  ): Promise<AnalyticsOverview> {
    return this.client.get<AnalyticsOverview>('/analytics/overview', {
      from: params?.from,
      to: params?.to,
      queueId: params?.queueId,
    });
  }

  /**
   * Get delivery metrics (time-series)
   *
   * @example
   * ```typescript
   * const metrics = await mq.analytics.getDeliveryMetrics({
   *   from: '2024-01-01T00:00:00Z',
   *   to: '2024-01-07T23:59:59Z',
   *   granularity: 'day',
   * });
   * for (const point of metrics.data) {
   *   console.log(`${point.timestamp}: ${point.delivered} delivered`);
   * }
   * ```
   */
  async getDeliveryMetrics(params?: AnalyticsParams): Promise<DeliveryMetrics> {
    return this.client.get<DeliveryMetrics>('/analytics/delivery', {
      from: params?.from,
      to: params?.to,
      queueId: params?.queueId,
      granularity: params?.granularity,
    });
  }

  /**
   * Get engagement metrics (opens, clicks, unsubscribes)
   *
   * @example
   * ```typescript
   * const metrics = await mq.analytics.getEngagementMetrics({
   *   from: '2024-01-01T00:00:00Z',
   *   to: '2024-01-31T23:59:59Z',
   * });
   * console.log(`Open rate: ${metrics.rates.openRate}%`);
   * console.log(`Click rate: ${metrics.rates.clickRate}%`);
   * ```
   */
  async getEngagementMetrics(params?: AnalyticsParams): Promise<EngagementMetrics> {
    return this.client.get<EngagementMetrics>('/analytics/engagement', {
      from: params?.from,
      to: params?.to,
      queueId: params?.queueId,
      granularity: params?.granularity,
    });
  }

  /**
   * Get bounce breakdown
   *
   * @example
   * ```typescript
   * const breakdown = await mq.analytics.getBounceBreakdown({
   *   from: '2024-01-01T00:00:00Z',
   *   to: '2024-01-31T23:59:59Z',
   * });
   * console.log(`Hard bounces: ${breakdown.byType.hard}`);
   * console.log(`Soft bounces: ${breakdown.byType.soft}`);
   * for (const domain of breakdown.topBouncedDomains) {
   *   console.log(`${domain.domain}: ${domain.count} bounces`);
   * }
   * ```
   */
  async getBounceBreakdown(
    params?: AnalyticsTimeRange & { queueId?: string }
  ): Promise<BounceBreakdown> {
    return this.client.get<BounceBreakdown>('/analytics/bounces', {
      from: params?.from,
      to: params?.to,
      queueId: params?.queueId,
    });
  }

  /**
   * Get reputation score for the app
   *
   * @example
   * ```typescript
   * const reputation = await mq.analytics.getReputation();
   * console.log(`Score: ${reputation.score}/100`);
   * if (reputation.isThrottled) {
   *   console.log(`Throttled: ${reputation.throttleReason}`);
   * }
   * for (const rec of reputation.recommendations) {
   *   console.log(`Recommendation: ${rec}`);
   * }
   * ```
   */
  async getReputation(): Promise<ReputationScore> {
    return this.client.get<ReputationScore>('/analytics/reputation');
  }
}
