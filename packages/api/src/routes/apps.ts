import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CreateAppSchema, UpdateAppSchema } from '@mail-queue/core';
import {
  createApp,
  getAppById,
  getApps,
  updateApp,
  deleteApp,
  regenerateWebhookSecret,
} from '../services/app.service.js';
import { requireAdminAuth } from '../middleware/auth.js';
import { handleIdempotentRequest, cacheSuccessResponse } from '../lib/idempotency.js';

const ParamsSchema = z.object({
  id: z.string().uuid(),
});

const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

export async function appRoutes(app: FastifyInstance): Promise<void> {
  // All app management requires admin auth
  app.addHook('preHandler', requireAdminAuth);

  // Create app
  app.post('/apps', async (request, reply) => {
    // Check for idempotent replay
    const replayed = await handleIdempotentRequest(request, reply, 'POST:/apps');
    if (replayed) return;

    const result = CreateAppSchema.safeParse(request.body);

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
      const newApp = await createApp(result.data);

      const responseBody = {
        success: true,
        data: {
          id: newApp.id,
          name: newApp.name,
          description: newApp.description,
          isActive: newApp.isActive,
          sandboxMode: newApp.sandboxMode,
          webhookUrl: newApp.webhookUrl,
          dailyLimit: newApp.dailyLimit,
          monthlyLimit: newApp.monthlyLimit,
          settings: newApp.settings,
          createdAt: newApp.createdAt,
          updatedAt: newApp.updatedAt,
        },
      };

      // Cache response for idempotency
      await cacheSuccessResponse(request, 201, responseBody, 'POST:/apps');

      return reply.status(201).send(responseBody);
    } catch (error) {
      request.log.error({ error }, 'Failed to create app');
      throw error;
    }
  });

  // List apps
  app.get('/apps', async (request, reply) => {
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

    const { limit, cursor, isActive } = queryResult.data;

    const result = await getApps({ limit, cursor, isActive });

    return {
      success: true,
      data: result.apps.map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        isActive: a.isActive,
        sandboxMode: a.sandboxMode,
        webhookUrl: a.webhookUrl,
        dailyLimit: a.dailyLimit,
        monthlyLimit: a.monthlyLimit,
        settings: a.settings,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
      })),
      cursor: result.cursor,
      hasMore: result.hasMore,
    };
  });

  // Get app by ID
  app.get('/apps/:id', async (request, reply) => {
    const paramsResult = ParamsSchema.safeParse(request.params);

    if (!paramsResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid app ID',
          details: paramsResult.error.issues,
        },
      });
    }

    const appData = await getAppById(paramsResult.data.id);

    if (!appData) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'App not found',
        },
      });
    }

    return {
      success: true,
      data: {
        id: appData.id,
        name: appData.name,
        description: appData.description,
        isActive: appData.isActive,
        sandboxMode: appData.sandboxMode,
        webhookUrl: appData.webhookUrl,
        dailyLimit: appData.dailyLimit,
        monthlyLimit: appData.monthlyLimit,
        settings: appData.settings,
        createdAt: appData.createdAt,
        updatedAt: appData.updatedAt,
      },
    };
  });

  // Update app
  app.patch('/apps/:id', async (request, reply) => {
    const paramsResult = ParamsSchema.safeParse(request.params);

    if (!paramsResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid app ID',
          details: paramsResult.error.issues,
        },
      });
    }

    const bodyResult = UpdateAppSchema.safeParse(request.body);

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

    const updated = await updateApp(paramsResult.data.id, bodyResult.data);

    if (!updated) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'App not found',
        },
      });
    }

    return {
      success: true,
      data: {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        isActive: updated.isActive,
        sandboxMode: updated.sandboxMode,
        webhookUrl: updated.webhookUrl,
        dailyLimit: updated.dailyLimit,
        monthlyLimit: updated.monthlyLimit,
        settings: updated.settings,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      },
    };
  });

  // Delete app
  app.delete('/apps/:id', async (request, reply) => {
    const paramsResult = ParamsSchema.safeParse(request.params);

    if (!paramsResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid app ID',
          details: paramsResult.error.issues,
        },
      });
    }

    const deleted = await deleteApp(paramsResult.data.id);

    if (!deleted) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'App not found',
        },
      });
    }

    return reply.status(204).send();
  });

  // Regenerate webhook secret
  app.post('/apps/:id/regenerate-webhook-secret', async (request, reply) => {
    const paramsResult = ParamsSchema.safeParse(request.params);

    if (!paramsResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid app ID',
          details: paramsResult.error.issues,
        },
      });
    }

    const result = await regenerateWebhookSecret(paramsResult.data.id);

    if (!result) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'App not found or webhook URL not configured',
        },
      });
    }

    return {
      success: true,
      data: {
        webhookSecret: result.secret,
      },
    };
  });
}
