import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { CreateEmailSchema, isMailQueueError } from '@mail-queue/core';
import {
  createEmail,
  getEmailById,
  getEmailsByAppId,
  getEmailEvents,
  cancelScheduledEmail,
  retryFailedEmail,
} from '../services/email.service.js';
import { getQueueByName } from '../services/queue.service.js';
import { requireAuth, requireScope, requireAnyScope } from '../middleware/auth.js';
import { getRateLimiter } from '../lib/rate-limiter.js';
import { config } from '../config.js';

const ParamsSchema = z.object({
  id: z.string().uuid(),
});

const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: z
    .enum(['queued', 'processing', 'sent', 'delivered', 'bounced', 'failed', 'cancelled'])
    .optional(),
  queueId: z.string().uuid().optional(),
});

export const emailRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const rateLimiter = getRateLimiter(config.globalRateLimit);

  // Create email
  app.post(
    '/emails',
    { preHandler: requireScope('email:send') },
    async (request, reply) => {
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
    }
  );

  // List emails
  app.get(
    '/emails',
    { preHandler: requireScope('email:read') },
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

      const { limit, offset, status, queueId } = queryResult.data;

      const { emails, total } = await getEmailsByAppId(request.appId, {
        limit,
        offset,
        status,
        queueId,
      });

      return {
        success: true,
        data: emails,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + emails.length < total,
        },
      };
    }
  );

  // Get email by ID
  app.get(
    '/emails/:id',
    { preHandler: requireScope('email:read') },
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
        const email = await getEmailById(paramsResult.data.id, request.appId);

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
    }
  );

  // Get email events
  app.get(
    '/emails/:id/events',
    { preHandler: requireScope('email:read') },
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
        const events = await getEmailEvents(paramsResult.data.id, request.appId);

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
    }
  );

  // Cancel scheduled email
  app.delete(
    '/emails/:id',
    { preHandler: requireScope('email:send') },
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
        await cancelScheduledEmail(paramsResult.data.id, request.appId);

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
    }
  );

  // Retry failed email
  app.post(
    '/emails/:id/retry',
    { preHandler: requireScope('email:send') },
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
        const result = await retryFailedEmail(paramsResult.data.id, request.appId);

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
    }
  );
};
