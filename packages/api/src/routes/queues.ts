import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CreateQueueSchema, UpdateQueueSchema } from '@mail-queue/core';
import {
  createQueue,
  getQueueById,
  getQueuesByAppId,
  getAllQueues,
  updateQueue,
  deleteQueue,
  pauseQueue,
  resumeQueue,
  getQueueStats,
} from '../services/queue.service.js';
import { requireAuth } from '../middleware/auth.js';

const ParamsSchema = z.object({
  id: z.string().uuid(),
});

const ListQuerySchema = z.object({
  appId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// Extended create schema that allows appId for admin users
const AdminCreateQueueSchema = CreateQueueSchema.extend({
  appId: z.string().uuid().optional(),
});

export async function queueRoutes(app: FastifyInstance): Promise<void> {
  // Create queue
  app.post('/queues', { preHandler: requireAuth }, async (request, reply) => {
    const result = AdminCreateQueueSchema.safeParse(request.body);

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

    // Determine appId: from API key auth or from request body (for admins)
    const appId = request.appId || result.data.appId;

    if (!appId) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'appId is required',
        },
      });
    }

    // Non-admin users can only create queues for their own app
    if (!request.isAdmin && request.appId !== appId) {
      return reply.status(403).send({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Cannot create queue for another app',
        },
      });
    }

    try {
      const queue = await createQueue(appId, result.data);

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
  });

  // List queues
  app.get('/queues', { preHandler: requireAuth }, async (request, reply) => {
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

    const { limit, offset, appId: queryAppId } = queryResult.data;
    const appId = request.appId || queryAppId;

    // Non-admin users must have an appId
    if (!request.isAdmin && !appId) {
      return reply.status(401).send({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'App authentication required',
        },
      });
    }

    // Admin without appId gets all queues
    if (request.isAdmin && !appId) {
      const { queues, total } = await getAllQueues({ limit, offset });

      return {
        success: true,
        data: queues.map((q) => ({
          id: q.id,
          appId: q.appId,
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

    const { queues, total } = await getQueuesByAppId(appId || '', { limit, offset });

    return {
      success: true,
      data: queues.map((q) => ({
        id: q.id,
        appId: q.appId,
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
  });

  // Get queue by ID
  app.get('/queues/:id', { preHandler: requireAuth }, async (request, reply) => {
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

    // Admin can get any queue, non-admin restricted to their app
    const queue = await getQueueById(
      paramsResult.data.id,
      request.isAdmin ? undefined : request.appId
    );

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
        appId: queue.appId,
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
  });

  // Update queue
  app.patch('/queues/:id', { preHandler: requireAuth }, async (request, reply) => {
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
      // Admin can update any queue, non-admin restricted to their app
      const queue = await updateQueue(
        paramsResult.data.id,
        request.isAdmin ? undefined : request.appId,
        bodyResult.data
      );

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
          appId: queue.appId,
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
  });

  // Delete queue
  app.delete('/queues/:id', { preHandler: requireAuth }, async (request, reply) => {
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

    // Admin can delete any queue, non-admin restricted to their app
    const deleted = await deleteQueue(
      paramsResult.data.id,
      request.isAdmin ? undefined : request.appId
    );

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
  });

  // Pause queue
  app.post('/queues/:id/pause', { preHandler: requireAuth }, async (request, reply) => {
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

    // Admin can pause any queue, non-admin restricted to their app
    const paused = await pauseQueue(
      paramsResult.data.id,
      request.isAdmin ? undefined : request.appId
    );

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
  });

  // Resume queue
  app.post('/queues/:id/resume', { preHandler: requireAuth }, async (request, reply) => {
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

    // Admin can resume any queue, non-admin restricted to their app
    const resumed = await resumeQueue(
      paramsResult.data.id,
      request.isAdmin ? undefined : request.appId
    );

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
  });

  // Get queue stats
  app.get('/queues/:id/stats', { preHandler: requireAuth }, async (request, reply) => {
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

    // Admin can get any queue stats, non-admin restricted to their app
    const stats = await getQueueStats(
      paramsResult.data.id,
      request.isAdmin ? undefined : request.appId
    );

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
  });
}
