import { z } from 'zod';

// ===========================================
// Time Range
// ===========================================

export const TimeRangeSchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
});

export type TimeRange = z.infer<typeof TimeRangeSchema>;

// ===========================================
// Analytics Overview
// ===========================================

export const AnalyticsOverviewSchema = z.object({
  period: TimeRangeSchema,
  totals: z.object({
    sent: z.number().int(),
    delivered: z.number().int(),
    bounced: z.number().int(),
    complained: z.number().int(),
    failed: z.number().int(),
  }),
  rates: z.object({
    deliveryRate: z.number().min(0).max(100),
    bounceRate: z.number().min(0).max(100),
    complaintRate: z.number().min(0).max(100),
  }),
  queues: z.object({
    pending: z.number().int(),
    processing: z.number().int(),
  }),
});

export type AnalyticsOverview = z.infer<typeof AnalyticsOverviewSchema>;

// ===========================================
// Delivery Metrics
// ===========================================

export const DeliveryMetricsPointSchema = z.object({
  timestamp: z.string().datetime(),
  sent: z.number().int(),
  delivered: z.number().int(),
  bounced: z.number().int(),
  failed: z.number().int(),
});

export type DeliveryMetricsPoint = z.infer<typeof DeliveryMetricsPointSchema>;

export const DeliveryMetricsSchema = z.object({
  period: TimeRangeSchema,
  granularity: z.enum(['minute', 'hour', 'day']),
  data: z.array(DeliveryMetricsPointSchema),
  totals: z.object({
    sent: z.number().int(),
    delivered: z.number().int(),
    bounced: z.number().int(),
    failed: z.number().int(),
  }),
});

export type DeliveryMetrics = z.infer<typeof DeliveryMetricsSchema>;

// ===========================================
// Engagement Metrics
// ===========================================

export const EngagementMetricsPointSchema = z.object({
  timestamp: z.string().datetime(),
  delivered: z.number().int(),
  opened: z.number().int(),
  clicked: z.number().int(),
  unsubscribed: z.number().int(),
});

export type EngagementMetricsPoint = z.infer<typeof EngagementMetricsPointSchema>;

export const EngagementMetricsSchema = z.object({
  period: TimeRangeSchema,
  granularity: z.enum(['minute', 'hour', 'day']),
  data: z.array(EngagementMetricsPointSchema),
  totals: z.object({
    delivered: z.number().int(),
    opened: z.number().int(),
    clicked: z.number().int(),
    unsubscribed: z.number().int(),
  }),
  rates: z.object({
    openRate: z.number().min(0).max(100),
    clickRate: z.number().min(0).max(100),
    unsubscribeRate: z.number().min(0).max(100),
  }),
});

export type EngagementMetrics = z.infer<typeof EngagementMetricsSchema>;

// ===========================================
// Bounce Breakdown
// ===========================================

export const BounceBreakdownSchema = z.object({
  period: TimeRangeSchema,
  totalBounces: z.number().int(),
  byType: z.object({
    hard: z.number().int(),
    soft: z.number().int(),
  }),
  byReason: z.array(
    z.object({
      reason: z.string(),
      count: z.number().int(),
      percentage: z.number(),
    })
  ),
  topBouncedDomains: z.array(
    z.object({
      domain: z.string(),
      count: z.number().int(),
      percentage: z.number(),
    })
  ),
});

export type BounceBreakdown = z.infer<typeof BounceBreakdownSchema>;

// ===========================================
// Reputation Score
// ===========================================

export const ReputationScoreSchema = z.object({
  appId: z.string().uuid(),
  score: z.number().min(0).max(100),
  bounceRate24h: z.number().min(0).max(100),
  complaintRate24h: z.number().min(0).max(100),
  isThrottled: z.boolean(),
  throttleReason: z.string().nullable(),
  updatedAt: z.date(),
  recommendations: z.array(z.string()),
});

export type ReputationScore = z.infer<typeof ReputationScoreSchema>;

// ===========================================
// Analytics Query Parameters
// ===========================================

export const AnalyticsQuerySchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  queueId: z.string().uuid().optional(),
  granularity: z.enum(['minute', 'hour', 'day']).default('hour'),
});

export type AnalyticsQuery = z.infer<typeof AnalyticsQuerySchema>;
