import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CreateAppSchema, UpdateAppSchema } from '@mail-queue/core';
import {
  createApp,
  getApps,
  getAppsByAccountId,
  updateApp,
  deleteApp,
  regenerateWebhookSecret,
  formatAppResponse,
} from '../services/app.service.js';
import { requireAuth } from '../middleware/auth.js';
import { verifyAppOwnership } from '../middleware/ownership.js';
import { handleIdempotentRequest, cacheSuccessResponse } from '../lib/idempotency.js';
import { canCreateApp } from '../services/account.service.js';
import { ErrorCodes } from '../lib/error-codes.js';

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
  // App management requires auth (admin or SaaS user)
  app.addHook('preHandler', requireAuth);

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
          code: ErrorCodes.VALIDATION_ERROR,
          message: 'Invalid request body',
          details: result.error.issues,
        },
      });
    }

    // For SaaS users, check app limit
    const accountId = request.accountId;
    if (accountId) {
      const limitCheck = await canCreateApp(accountId);
      if (!limitCheck.allowed) {
        return reply.status(403).send({
          success: false,
          error: {
            code: ErrorCodes.LIMIT_EXCEEDED,
            message: `App limit reached (${limitCheck.current}/${limitCheck.max}). Upgrade your plan to create more apps.`,
            upgrade: true,
          },
        });
      }
    }

    try {
      const newApp = await createApp({
        ...result.data,
        accountId: accountId ?? undefined,
      });

      const responseBody = {
        success: true,
        data: formatAppResponse(newApp),
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
          code: ErrorCodes.VALIDATION_ERROR,
          message: 'Invalid query parameters',
          details: queryResult.error.issues,
        },
      });
    }

    const { limit, cursor, isActive } = queryResult.data;
    const accountId = request.accountId;

    // For SaaS users, only return their apps
    if (accountId) {
      const appList = await getAppsByAccountId(accountId);
      return {
        success: true,
        data: appList.map(formatAppResponse),
        cursor: null,
        hasMore: false,
      };
    }

    // Admin users get all apps with pagination
    const result = await getApps({ limit, cursor, isActive });

    return {
      success: true,
      data: result.apps.map(formatAppResponse),
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
          code: ErrorCodes.VALIDATION_ERROR,
          message: 'Invalid app ID',
          details: paramsResult.error.issues,
        },
      });
    }

    // Verify ownership for SaaS users
    const { resource: appData, authorized } = await verifyAppOwnership(
      request,
      reply,
      paramsResult.data.id
    );
    if (!authorized || !appData) return;

    return {
      success: true,
      data: formatAppResponse(appData),
    };
  });

  // Update app
  app.patch('/apps/:id', async (request, reply) => {
    const paramsResult = ParamsSchema.safeParse(request.params);

    if (!paramsResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: 'Invalid app ID',
          details: paramsResult.error.issues,
        },
      });
    }

    // Verify ownership for SaaS users
    const { authorized } = await verifyAppOwnership(request, reply, paramsResult.data.id);
    if (!authorized) return;

    const bodyResult = UpdateAppSchema.safeParse(request.body);

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

    const updated = await updateApp(paramsResult.data.id, bodyResult.data);

    if (!updated) {
      return reply.status(404).send({
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: 'App not found',
        },
      });
    }

    return {
      success: true,
      data: formatAppResponse(updated),
    };
  });

  // Delete app
  app.delete('/apps/:id', async (request, reply) => {
    const paramsResult = ParamsSchema.safeParse(request.params);

    if (!paramsResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: 'Invalid app ID',
          details: paramsResult.error.issues,
        },
      });
    }

    // Verify ownership for SaaS users
    const { authorized } = await verifyAppOwnership(request, reply, paramsResult.data.id);
    if (!authorized) return;

    const deleted = await deleteApp(paramsResult.data.id);

    if (!deleted) {
      return reply.status(404).send({
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: 'App not found',
        },
      });
    }

    return reply.status(204).send();
  });

  // Create/regenerate webhook secret
  // POST to create a new secret (replaces existing)
  app.post('/apps/:id/webhook-secret', async (request, reply) => {
    const paramsResult = ParamsSchema.safeParse(request.params);

    if (!paramsResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: 'Invalid app ID',
          details: paramsResult.error.issues,
        },
      });
    }

    // Verify ownership for SaaS users
    const { authorized } = await verifyAppOwnership(request, reply, paramsResult.data.id);
    if (!authorized) return;

    const result = await regenerateWebhookSecret(paramsResult.data.id);

    if (!result) {
      return reply.status(404).send({
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
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
