import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  getAnalyticsOverview,
  getDeliveryMetrics,
  getEngagementMetrics,
  getBounceBreakdown,
  getReputationScore,
  getGlobalAnalyticsOverview,
} from '../services/analytics.service.js';
import { requireAuth } from '../middleware/auth.js';

// Default time range: last 24 hours
function getDefaultTimeRange(): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
  return { from, to };
}

const TimeRangeQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  appId: z.string().uuid().optional(),
  queueId: z.string().uuid().optional(),
  granularity: z.enum(['minute', 'hour', 'day']).default('hour'),
});

export const analyticsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Get analytics overview
  app.get('/analytics/overview', { preHandler: requireAuth }, async (request, reply) => {
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

    const { from, to, queueId, appId: queryAppId } = queryResult.data;
    const defaultRange = getDefaultTimeRange();

    // Determine appId: from API key, query param (for admins), or null for global
    const appId = request.appId || queryAppId;

    // If not admin and no appId, require app authentication
    if (!request.isAdmin && !appId) {
      return reply.status(401).send({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'App authentication required',
        },
      });
    }

    // Admin without appId gets global overview
    if (request.isAdmin && !appId) {
      const overview = await getGlobalAnalyticsOverview({
        from: from ? new Date(from) : defaultRange.from,
        to: to ? new Date(to) : defaultRange.to,
      });

      return reply.send({
        success: true,
        data: overview,
      });
    }

    const overview = await getAnalyticsOverview({
      appId: appId || '',
      from: from ? new Date(from) : defaultRange.from,
      to: to ? new Date(to) : defaultRange.to,
      queueId,
    });

    return reply.send({
      success: true,
      data: overview,
    });
  });

  // Get delivery metrics (time-series)
  app.get('/analytics/delivery', { preHandler: requireAuth }, async (request, reply) => {
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

    const { from, to, queueId, granularity, appId: queryAppId } = queryResult.data;
    const defaultRange = getDefaultTimeRange();
    const appId = request.appId || queryAppId;

    if (!request.isAdmin && !appId) {
      return reply.status(401).send({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'App authentication required',
        },
      });
    }

    const metrics = await getDeliveryMetrics({
      appId: appId || '',
      from: from ? new Date(from) : defaultRange.from,
      to: to ? new Date(to) : defaultRange.to,
      queueId,
      granularity,
    });

    return reply.send({
      success: true,
      data: metrics,
    });
  });

  // Get engagement metrics (opens/clicks time-series)
  app.get('/analytics/engagement', { preHandler: requireAuth }, async (request, reply) => {
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

    const { from, to, queueId, granularity, appId: queryAppId } = queryResult.data;
    const defaultRange = getDefaultTimeRange();
    const appId = request.appId || queryAppId;

    if (!request.isAdmin && !appId) {
      return reply.status(401).send({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'App authentication required',
        },
      });
    }

    const metrics = await getEngagementMetrics({
      appId: appId || '',
      from: from ? new Date(from) : defaultRange.from,
      to: to ? new Date(to) : defaultRange.to,
      queueId,
      granularity,
    });

    return reply.send({
      success: true,
      data: metrics,
    });
  });

  // Get bounce breakdown
  app.get('/analytics/bounces', { preHandler: requireAuth }, async (request, reply) => {
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

    const { from, to, queueId, appId: queryAppId } = queryResult.data;
    const defaultRange = getDefaultTimeRange();
    const appId = request.appId || queryAppId;

    if (!request.isAdmin && !appId) {
      return reply.status(401).send({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'App authentication required',
        },
      });
    }

    const breakdown = await getBounceBreakdown({
      appId: appId || '',
      from: from ? new Date(from) : defaultRange.from,
      to: to ? new Date(to) : defaultRange.to,
      queueId,
    });

    return reply.send({
      success: true,
      data: breakdown,
    });
  });

  // Get reputation score
  app.get('/analytics/reputation', { preHandler: requireAuth }, async (request, reply) => {
    const queryResult = z.object({ appId: z.string().uuid().optional() }).safeParse(request.query);
    const appId = request.appId || queryResult.data?.appId;

    if (!request.isAdmin && !appId) {
      return reply.status(401).send({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'App authentication required',
        },
      });
    }

    // Return null reputation for global view
    if (!appId) {
      return reply.send({
        success: true,
        data: null,
      });
    }

    const reputation = await getReputationScore(appId);

    return reply.send({
      success: true,
      data: reputation,
    });
  });
};
