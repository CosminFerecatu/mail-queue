import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  getAnalyticsOverview,
  getDeliveryMetrics,
  getEngagementMetrics,
  getBounceBreakdown,
  getReputationScore,
} from '../services/analytics.service.js';
import { requireScope } from '../middleware/auth.js';

// Default time range: last 24 hours
function getDefaultTimeRange(): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
  return { from, to };
}

const TimeRangeQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  queueId: z.string().uuid().optional(),
  granularity: z.enum(['minute', 'hour', 'day']).default('hour'),
});

export const analyticsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Get analytics overview
  app.get(
    '/analytics/overview',
    { preHandler: requireScope('analytics:read') },
    async (request, reply) => {
      if (!request.appId) {
        return reply.status(401).send({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'App authentication required',
          },
        });
      }

      const queryResult = TimeRangeQuerySchema.safeParse(request.query);

      if (!queryResult.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid query parameters',
            details: queryResult.error.issues,
          },
        });
      }

      const { from, to, queueId } = queryResult.data;
      const defaultRange = getDefaultTimeRange();

      const overview = await getAnalyticsOverview({
        appId: request.appId,
        from: from ? new Date(from) : defaultRange.from,
        to: to ? new Date(to) : defaultRange.to,
        queueId,
      });

      return reply.send({
        success: true,
        data: overview,
      });
    }
  );

  // Get delivery metrics (time-series)
  app.get(
    '/analytics/delivery',
    { preHandler: requireScope('analytics:read') },
    async (request, reply) => {
      if (!request.appId) {
        return reply.status(401).send({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'App authentication required',
          },
        });
      }

      const queryResult = TimeRangeQuerySchema.safeParse(request.query);

      if (!queryResult.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid query parameters',
            details: queryResult.error.issues,
          },
        });
      }

      const { from, to, queueId, granularity } = queryResult.data;
      const defaultRange = getDefaultTimeRange();

      const metrics = await getDeliveryMetrics({
        appId: request.appId,
        from: from ? new Date(from) : defaultRange.from,
        to: to ? new Date(to) : defaultRange.to,
        queueId,
        granularity,
      });

      return reply.send({
        success: true,
        data: metrics,
      });
    }
  );

  // Get engagement metrics (opens/clicks time-series)
  app.get(
    '/analytics/engagement',
    { preHandler: requireScope('analytics:read') },
    async (request, reply) => {
      if (!request.appId) {
        return reply.status(401).send({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'App authentication required',
          },
        });
      }

      const queryResult = TimeRangeQuerySchema.safeParse(request.query);

      if (!queryResult.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid query parameters',
            details: queryResult.error.issues,
          },
        });
      }

      const { from, to, queueId, granularity } = queryResult.data;
      const defaultRange = getDefaultTimeRange();

      const metrics = await getEngagementMetrics({
        appId: request.appId,
        from: from ? new Date(from) : defaultRange.from,
        to: to ? new Date(to) : defaultRange.to,
        queueId,
        granularity,
      });

      return reply.send({
        success: true,
        data: metrics,
      });
    }
  );

  // Get bounce breakdown
  app.get(
    '/analytics/bounces',
    { preHandler: requireScope('analytics:read') },
    async (request, reply) => {
      if (!request.appId) {
        return reply.status(401).send({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'App authentication required',
          },
        });
      }

      const queryResult = TimeRangeQuerySchema.safeParse(request.query);

      if (!queryResult.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid query parameters',
            details: queryResult.error.issues,
          },
        });
      }

      const { from, to, queueId } = queryResult.data;
      const defaultRange = getDefaultTimeRange();

      const breakdown = await getBounceBreakdown({
        appId: request.appId,
        from: from ? new Date(from) : defaultRange.from,
        to: to ? new Date(to) : defaultRange.to,
        queueId,
      });

      return reply.send({
        success: true,
        data: breakdown,
      });
    }
  );

  // Get reputation score
  app.get(
    '/analytics/reputation',
    { preHandler: requireScope('analytics:read') },
    async (request, reply) => {
      if (!request.appId) {
        return reply.status(401).send({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'App authentication required',
          },
        });
      }

      const reputation = await getReputationScore(request.appId);

      return reply.send({
        success: true,
        data: reputation,
      });
    }
  );
};
