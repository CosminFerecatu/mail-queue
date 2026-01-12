import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CreateQueueSchema, UpdateQueueSchema } from '@mail-queue/core';
import {
  createQueue,
  getQueueById,
  getQueuesByAppId,
  getQueuesByAccountId,
  getAllQueues,
  updateQueue,
  deleteQueue,
  pauseQueue,
  resumeQueue,
  getQueueStats,
  formatQueueResponse,
} from '../services/queue.service.js';
import { requireAuth } from '../middleware/auth.js';
import { handleIdempotentRequest, cacheSuccessResponse } from '../lib/idempotency.js';
import { canCreateQueue } from '../services/account.service.js';
import { getAppById } from '../services/app.service.js';
import { ErrorCodes } from '../lib/error-codes.js';

const ParamsSchema = z.object({
  id: z.string().uuid(),
});

const ListQuerySchema = z.object({
  appId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

// Extended create schema that allows appId for admin users
const AdminCreateQueueSchema = CreateQueueSchema.extend({
  appId: z.string().uuid().optional(),
});

export async function queueRoutes(app: FastifyInstance): Promise<void> {
  // Create queue
  app.post('/queues', { preHandler: requireAuth }, async (request, reply) => {
    // Check for idempotent replay
    const replayed = await handleIdempotentRequest(request, reply, 'POST:/queues');
    if (replayed) return;

    const result = AdminCreateQueueSchema.safeParse(request.body);

    if (!result.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
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
          code: ErrorCodes.VALIDATION_ERROR,
          message: 'appId is required',
        },
      });
    }

    // Non-admin users can only create queues for their own app
    if (!request.isAdmin && request.appId !== appId) {
      return reply.status(403).send({
        success: false,
        error: {
          code: ErrorCodes.FORBIDDEN,
          message: 'Cannot create queue for another app',
        },
      });
    }

    // For SaaS users, check queue limit per app
    const accountId = request.accountId;
    if (accountId) {
      // Verify the app belongs to this account
      const app = await getAppById(appId);
      if (!app || app.accountId !== accountId) {
        return reply.status(403).send({
          success: false,
          error: {
            code: ErrorCodes.FORBIDDEN,
            message: 'Cannot create queue for an app you do not own',
          },
        });
      }

      const limitCheck = await canCreateQueue(accountId, appId);
      if (!limitCheck.allowed) {
        return reply.status(403).send({
          success: false,
          error: {
            code: ErrorCodes.LIMIT_EXCEEDED,
            message: `Queue limit reached for this app (${limitCheck.current}/${limitCheck.max}). Upgrade your plan to create more queues.`,
            upgrade: true,
          },
        });
      }
    }

    try {
      const queue = await createQueue(appId, result.data);

      const responseBody = {
        success: true,
        data: formatQueueResponse(queue),
      };

      // Cache response for idempotency
      await cacheSuccessResponse(request, 201, responseBody, 'POST:/queues');

      return reply.status(201).send(responseBody);
    } catch (error) {
      if (error instanceof Error && error.message.includes('SMTP configuration')) {
        return reply.status(400).send({
          success: false,
          error: {
            code: ErrorCodes.INVALID_SMTP_CONFIG,
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
            code: ErrorCodes.DUPLICATE_QUEUE,
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
          code: ErrorCodes.VALIDATION_ERROR,
          message: 'Invalid query parameters',
          details: queryResult.error.issues,
        },
      });
    }

    const { limit, cursor, appId: queryAppId } = queryResult.data;
    const appId = request.appId || queryAppId;
    const accountId = request.accountId;

    // SaaS users get queues from their account's apps
    if (accountId && !appId) {
      const result = await getQueuesByAccountId(accountId, { limit, cursor });

      return {
        success: true,
        data: result.queues.map(formatQueueResponse),
        cursor: result.cursor,
        hasMore: result.hasMore,
      };
    }

    // Non-admin, non-SaaS users must have an appId
    if (!request.isAdmin && !accountId && !appId) {
      return reply.status(401).send({
        success: false,
        error: {
          code: ErrorCodes.UNAUTHORIZED,
          message: 'App authentication required',
        },
      });
    }

    // System admin without appId gets all queues
    if (request.isAdmin && !accountId && !appId) {
      const result = await getAllQueues({ limit, cursor });

      return {
        success: true,
        data: result.queues.map(formatQueueResponse),
        cursor: result.cursor,
        hasMore: result.hasMore,
      };
    }

    // Filter by specific appId
    const result = await getQueuesByAppId(appId || '', { limit, cursor });

    return {
      success: true,
      data: result.queues.map(formatQueueResponse),
      cursor: result.cursor,
      hasMore: result.hasMore,
    };
  });

  // Get queue by ID
  app.get('/queues/:id', { preHandler: requireAuth }, async (request, reply) => {
    const paramsResult = ParamsSchema.safeParse(request.params);

    if (!paramsResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
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
          code: ErrorCodes.NOT_FOUND,
          message: 'Queue not found',
        },
      });
    }

    return {
      success: true,
      data: formatQueueResponse(queue),
    };
  });

  // Update queue
  app.patch('/queues/:id', { preHandler: requireAuth }, async (request, reply) => {
    const paramsResult = ParamsSchema.safeParse(request.params);

    if (!paramsResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
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
          code: ErrorCodes.VALIDATION_ERROR,
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
            code: ErrorCodes.NOT_FOUND,
            message: 'Queue not found',
          },
        });
      }

      return {
        success: true,
        data: formatQueueResponse(queue),
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('SMTP configuration')) {
        return reply.status(400).send({
          success: false,
          error: {
            code: ErrorCodes.INVALID_SMTP_CONFIG,
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
          code: ErrorCodes.VALIDATION_ERROR,
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
          code: ErrorCodes.NOT_FOUND,
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
          code: ErrorCodes.VALIDATION_ERROR,
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
          code: ErrorCodes.NOT_FOUND,
          message: 'Queue not found',
        },
      });
    }

    // Get updated queue to return current state
    const queue = await getQueueById(
      paramsResult.data.id,
      request.isAdmin ? undefined : request.appId
    );

    return {
      success: true,
      data: {
        id: queue?.id,
        isPaused: true,
        updatedAt: queue?.updatedAt,
      },
    };
  });

  // Resume queue
  app.post('/queues/:id/resume', { preHandler: requireAuth }, async (request, reply) => {
    const paramsResult = ParamsSchema.safeParse(request.params);

    if (!paramsResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
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
          code: ErrorCodes.NOT_FOUND,
          message: 'Queue not found',
        },
      });
    }

    // Get updated queue to return current state
    const queue = await getQueueById(
      paramsResult.data.id,
      request.isAdmin ? undefined : request.appId
    );

    return {
      success: true,
      data: {
        id: queue?.id,
        isPaused: false,
        updatedAt: queue?.updatedAt,
      },
    };
  });

  // Get queue stats
  app.get('/queues/:id/stats', { preHandler: requireAuth }, async (request, reply) => {
    const paramsResult = ParamsSchema.safeParse(request.params);

    if (!paramsResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
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
          code: ErrorCodes.NOT_FOUND,
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
