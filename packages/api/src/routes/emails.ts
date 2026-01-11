import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { CreateEmailSchema, CreateBatchEmailSchema, isMailQueueError } from '@mail-queue/core';
import {
  createEmail,
  createBatchEmails,
  getEmailById,
  getEmailsByAppId,
  getEmailsByAccountId,
  getAllEmails,
  getEmailEvents,
  cancelScheduledEmail,
  retryFailedEmail,
} from '../services/email.service.js';
import { getQueueByName } from '../services/queue.service.js';
import { requireScope, requireAuth } from '../middleware/auth.js';
import { getRateLimiter } from '../lib/rate-limiter.js';
import { recordRateLimitHit } from '../lib/metrics.js';
import { config } from '../config.js';

const ParamsSchema = z.object({
  id: z.string().uuid(),
});

const ListQuerySchema = z.object({
  appId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
  status: z
    .enum(['queued', 'processing', 'sent', 'delivered', 'bounced', 'failed', 'cancelled'])
    .optional(),
  queueId: z.string().uuid().optional(),
});

export const emailRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const rateLimiter = getRateLimiter(config.globalRateLimit);

  // Create email
  app.post('/emails', { preHandler: requireScope('email:send') }, async (request, reply) => {
    if (!request.appId || !request.apiKey) {
      return reply.status(401).send({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'App authentication required',
        },
      });
    }

    try {
      // Validate request body
      const parseResult = CreateEmailSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: parseResult.error.issues.map((i) => ({
              path: i.path.join('.'),
              message: i.message,
            })),
          },
        });
      }

      const input = parseResult.data;

      // Get queue to check rate limit
      let queueRateLimit: number | null = null;
      let queueId: string | undefined;
      if (input.queue) {
        const queue = await getQueueByName(input.queue, request.appId);
        if (queue) {
          queueRateLimit = queue.rateLimit;
          queueId = queue.id;

          // Check if queue is paused
          if (queue.isPaused) {
            return reply.status(503).send({
              success: false,
              error: {
                code: 'QUEUE_PAUSED',
                message: `Queue "${input.queue}" is paused`,
              },
            });
          }
        }
      }

      // Check hierarchical rate limits
      const rateLimitCheck = await rateLimiter.checkHierarchicalLimit({
        apiKeyId: request.apiKey.id,
        apiKeyLimit: request.apiKey.rateLimit,
        appId: request.appId,
        appDailyLimit: request.apiKey.app.dailyLimit,
        queueId,
        queueRateLimit,
      });

      if (!rateLimitCheck.allowed && rateLimitCheck.blockedBy) {
        // Record rate limit hit metric
        recordRateLimitHit(request.appId, rateLimitCheck.blockedBy);

        const blockedResult = rateLimitCheck.results[rateLimitCheck.blockedBy];
        if (!blockedResult) {
          return reply.status(429).send({
            success: false,
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message: 'Rate limit exceeded',
              retryAfter: 60,
            },
          });
        }
        const headers = rateLimiter.getRateLimitHeaders(blockedResult);

        for (const [key, value] of Object.entries(headers)) {
          reply.header(key, value);
        }

        return reply.status(429).send({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: `Rate limit exceeded for ${rateLimitCheck.blockedBy}`,
            retryAfter: Math.ceil((blockedResult.resetAt - Date.now()) / 1000),
          },
        });
      }

      // Add rate limit headers from API key limit
      const headers = rateLimiter.getRateLimitHeaders(rateLimitCheck.results.apiKey);
      for (const [key, value] of Object.entries(headers)) {
        reply.header(key, value);
      }

      // Get idempotency key from header
      const idempotencyKey = request.headers['idempotency-key'] as string | undefined;

      const result = await createEmail({
        appId: request.appId,
        input,
        idempotencyKey,
      });

      return reply.status(201).send({
        success: true,
        data: result,
      });
    } catch (error) {
      if (isMailQueueError(error)) {
        return reply.status(error.statusCode).send({
          success: false,
          error: error.toJSON(),
        });
      }
      throw error;
    }
  });

  // Create batch emails
  app.post('/emails/batch', { preHandler: requireScope('email:send') }, async (request, reply) => {
    if (!request.appId || !request.apiKey) {
      return reply.status(401).send({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'App authentication required',
        },
      });
    }

    try {
      // Validate request body
      const parseResult = CreateBatchEmailSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: parseResult.error.issues.map((i) => ({
              path: i.path.join('.'),
              message: i.message,
            })),
          },
        });
      }

      const input = parseResult.data;

      // Get queue to check rate limit and paused status
      if (input.queue) {
        const queue = await getQueueByName(input.queue, request.appId);
        if (queue?.isPaused) {
          return reply.status(503).send({
            success: false,
            error: {
              code: 'QUEUE_PAUSED',
              message: `Queue "${input.queue}" is paused`,
            },
          });
        }
      }

      const result = await createBatchEmails({
        appId: request.appId,
        input,
      });

      // Return appropriate status based on results
      const statusCode = result.failedCount === result.totalCount ? 400 : 201;

      return reply.status(statusCode).send({
        success: result.queuedCount > 0,
        data: result,
      });
    } catch (error) {
      if (isMailQueueError(error)) {
        return reply.status(error.statusCode).send({
          success: false,
          error: error.toJSON(),
        });
      }
      throw error;
    }
  });

  // List emails
  app.get('/emails', { preHandler: requireAuth }, async (request, reply) => {
    const queryResult = ListQuerySchema.safeParse(request.query);

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

    const { limit, cursor, status, queueId, appId: queryAppId } = queryResult.data;
    const appId = request.appId || queryAppId;
    const accountId = request.accountId;

    // SaaS users get emails from their account's apps
    if (accountId && !appId) {
      const result = await getEmailsByAccountId(accountId, {
        limit,
        cursor,
        status,
        queueId,
      });

      return {
        success: true,
        data: result.emails,
        cursor: result.cursor,
        hasMore: result.hasMore,
      };
    }

    // Non-admin, non-SaaS users must have an appId
    if (!request.isAdmin && !accountId && !appId) {
      return reply.status(401).send({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'App authentication required',
        },
      });
    }

    // System admin without appId gets all emails
    if (request.isAdmin && !accountId && !appId) {
      const result = await getAllEmails({
        limit,
        cursor,
        status,
        queueId,
      });

      return {
        success: true,
        data: result.emails,
        cursor: result.cursor,
        hasMore: result.hasMore,
      };
    }

    // Filter by specific appId
    const result = await getEmailsByAppId(appId || '', {
      limit,
      cursor,
      status,
      queueId,
    });

    return {
      success: true,
      data: result.emails,
      cursor: result.cursor,
      hasMore: result.hasMore,
    };
  });

  // Get email by ID
  app.get('/emails/:id', { preHandler: requireAuth }, async (request, reply) => {
    const paramsResult = ParamsSchema.safeParse(request.params);

    if (!paramsResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid email ID',
          details: paramsResult.error.issues,
        },
      });
    }

    try {
      // Admin can get any email, non-admin restricted to their app
      const email = await getEmailById(
        paramsResult.data.id,
        request.isAdmin ? undefined : request.appId
      );

      return reply.send({
        success: true,
        data: email,
      });
    } catch (error) {
      if (isMailQueueError(error)) {
        return reply.status(error.statusCode).send({
          success: false,
          error: error.toJSON(),
        });
      }
      throw error;
    }
  });

  // Get email events
  app.get('/emails/:id/events', { preHandler: requireAuth }, async (request, reply) => {
    const paramsResult = ParamsSchema.safeParse(request.params);

    if (!paramsResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid email ID',
          details: paramsResult.error.issues,
        },
      });
    }

    try {
      // Admin can get any email events, non-admin restricted to their app
      const events = await getEmailEvents(
        paramsResult.data.id,
        request.isAdmin ? undefined : request.appId
      );

      return reply.send({
        success: true,
        data: events,
      });
    } catch (error) {
      if (isMailQueueError(error)) {
        return reply.status(error.statusCode).send({
          success: false,
          error: error.toJSON(),
        });
      }
      throw error;
    }
  });

  // Cancel scheduled email
  app.delete('/emails/:id', { preHandler: requireAuth }, async (request, reply) => {
    const paramsResult = ParamsSchema.safeParse(request.params);

    if (!paramsResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid email ID',
          details: paramsResult.error.issues,
        },
      });
    }

    try {
      // Admin can cancel any email, non-admin restricted to their app
      await cancelScheduledEmail(paramsResult.data.id, request.isAdmin ? undefined : request.appId);

      return reply.status(204).send();
    } catch (error) {
      if (isMailQueueError(error)) {
        return reply.status(error.statusCode).send({
          success: false,
          error: error.toJSON(),
        });
      }
      throw error;
    }
  });

  // Retry failed email
  app.post('/emails/:id/retry', { preHandler: requireAuth }, async (request, reply) => {
    const paramsResult = ParamsSchema.safeParse(request.params);

    if (!paramsResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid email ID',
          details: paramsResult.error.issues,
        },
      });
    }

    try {
      // Admin can retry any email, non-admin restricted to their app
      const result = await retryFailedEmail(
        paramsResult.data.id,
        request.isAdmin ? undefined : request.appId
      );

      return reply.send({
        success: true,
        data: result,
      });
    } catch (error) {
      if (isMailQueueError(error)) {
        return reply.status(error.statusCode).send({
          success: false,
          error: error.toJSON(),
        });
      }
      throw error;
    }
  });
};
