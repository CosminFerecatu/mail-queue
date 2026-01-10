import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CreateQueueSchema, UpdateQueueSchema } from '@mail-queue/core';
import {
  createQueue,
  getQueueById,
  getQueuesByAppId,
  updateQueue,
  deleteQueue,
  pauseQueue,
  resumeQueue,
  getQueueStats,
} from '../services/queue.service.js';
import { requireAuth, requireScope } from '../middleware/auth.js';

const ParamsSchema = z.object({
  id: z.string().uuid(),
});

const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function queueRoutes(app: FastifyInstance): Promise<void> {
  // Create queue
  app.post(
    '/queues',
    { preHandler: requireScope('queue:manage') },
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

      const result = CreateQueueSchema.safeParse(request.body);

      if (!result.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: result.error.issues,
          },
        });
      }

      try {
        const queue = await createQueue(request.appId, result.data);

        return reply.status(201).send({
          success: true,
          data: {
            id: queue.id,
            name: queue.name,
            priority: queue.priority,
            rateLimit: queue.rateLimit,
            maxRetries: queue.maxRetries,
            retryDelay: queue.retryDelay,
            smtpConfigId: queue.smtpConfigId,
            isPaused: queue.isPaused,
            settings: queue.settings,
            createdAt: queue.createdAt,
            updatedAt: queue.updatedAt,
          },
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes('SMTP configuration')) {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'INVALID_SMTP_CONFIG',
              message: error.message,
            },
          });
        }

        // Handle unique constraint violation
        if (
          error instanceof Error &&
          error.message.includes('unique constraint') &&
          error.message.includes('queues_app_id_name')
        ) {
          return reply.status(409).send({
            success: false,
            error: {
              code: 'DUPLICATE_QUEUE',
              message: 'A queue with this name already exists for this app',
            },
          });
        }

        throw error;
      }
    }
  );

  // List queues
  app.get(
    '/queues',
    { preHandler: requireAuth },
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

      const { limit, offset } = queryResult.data;

      const { queues, total } = await getQueuesByAppId(request.appId, { limit, offset });

      return {
        success: true,
        data: queues.map((q) => ({
          id: q.id,
          name: q.name,
          priority: q.priority,
          rateLimit: q.rateLimit,
          maxRetries: q.maxRetries,
          retryDelay: q.retryDelay,
          smtpConfigId: q.smtpConfigId,
          isPaused: q.isPaused,
          settings: q.settings,
          createdAt: q.createdAt,
          updatedAt: q.updatedAt,
        })),
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + queues.length < total,
        },
      };
    }
  );

  // Get queue by ID
  app.get(
    '/queues/:id',
    { preHandler: requireAuth },
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
            message: 'Invalid queue ID',
            details: paramsResult.error.issues,
          },
        });
      }

      const queue = await getQueueById(paramsResult.data.id, request.appId);

      if (!queue) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Queue not found',
          },
        });
      }

      return {
        success: true,
        data: {
          id: queue.id,
          name: queue.name,
          priority: queue.priority,
          rateLimit: queue.rateLimit,
          maxRetries: queue.maxRetries,
          retryDelay: queue.retryDelay,
          smtpConfigId: queue.smtpConfigId,
          isPaused: queue.isPaused,
          settings: queue.settings,
          createdAt: queue.createdAt,
          updatedAt: queue.updatedAt,
        },
      };
    }
  );

  // Update queue
  app.patch(
    '/queues/:id',
    { preHandler: requireScope('queue:manage') },
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
            message: 'Invalid queue ID',
            details: paramsResult.error.issues,
          },
        });
      }

      const bodyResult = UpdateQueueSchema.safeParse(request.body);

      if (!bodyResult.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: bodyResult.error.issues,
          },
        });
      }

      try {
        const queue = await updateQueue(paramsResult.data.id, request.appId, bodyResult.data);

        if (!queue) {
          return reply.status(404).send({
            success: false,
            error: {
              code: 'NOT_FOUND',
              message: 'Queue not found',
            },
          });
        }

        return {
          success: true,
          data: {
            id: queue.id,
            name: queue.name,
            priority: queue.priority,
            rateLimit: queue.rateLimit,
            maxRetries: queue.maxRetries,
            retryDelay: queue.retryDelay,
            smtpConfigId: queue.smtpConfigId,
            isPaused: queue.isPaused,
            settings: queue.settings,
            createdAt: queue.createdAt,
            updatedAt: queue.updatedAt,
          },
        };
      } catch (error) {
        if (error instanceof Error && error.message.includes('SMTP configuration')) {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'INVALID_SMTP_CONFIG',
              message: error.message,
            },
          });
        }
        throw error;
      }
    }
  );

  // Delete queue
  app.delete(
    '/queues/:id',
    { preHandler: requireScope('queue:manage') },
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
            message: 'Invalid queue ID',
            details: paramsResult.error.issues,
          },
        });
      }

      const deleted = await deleteQueue(paramsResult.data.id, request.appId);

      if (!deleted) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Queue not found',
          },
        });
      }

      return reply.status(204).send();
    }
  );

  // Pause queue
  app.post(
    '/queues/:id/pause',
    { preHandler: requireScope('queue:manage') },
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
            message: 'Invalid queue ID',
            details: paramsResult.error.issues,
          },
        });
      }

      const paused = await pauseQueue(paramsResult.data.id, request.appId);

      if (!paused) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Queue not found',
          },
        });
      }

      return {
        success: true,
        message: 'Queue paused successfully',
      };
    }
  );

  // Resume queue
  app.post(
    '/queues/:id/resume',
    { preHandler: requireScope('queue:manage') },
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
            message: 'Invalid queue ID',
            details: paramsResult.error.issues,
          },
        });
      }

      const resumed = await resumeQueue(paramsResult.data.id, request.appId);

      if (!resumed) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Queue not found',
          },
        });
      }

      return {
        success: true,
        message: 'Queue resumed successfully',
      };
    }
  );

  // Get queue stats
  app.get(
    '/queues/:id/stats',
    { preHandler: requireAuth },
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
            message: 'Invalid queue ID',
            details: paramsResult.error.issues,
          },
        });
      }

      const stats = await getQueueStats(paramsResult.data.id, request.appId);

      if (!stats) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Queue not found',
          },
        });
      }

      return {
        success: true,
        data: stats,
      };
    }
  );
}
