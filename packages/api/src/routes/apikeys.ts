import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CreateApiKeySchema } from '@mail-queue/core';
import {
  createApiKey,
  getApiKeyById,
  getApiKeysByAppId,
  revokeApiKey,
  deleteApiKey,
  rotateApiKey,
  formatApiKeyResponse,
} from '../services/apikey.service.js';
import { getAppById } from '../services/app.service.js';
import { requireAuth } from '../middleware/auth.js';
import { verifyAppAccess } from '../middleware/ownership.js';
import { handleIdempotentRequest, cacheSuccessResponse } from '../lib/idempotency.js';
import { ErrorCodes } from '../lib/error-codes.js';

const AppParamsSchema = z.object({
  appId: z.string().uuid(),
});

const KeyParamsSchema = z.object({
  appId: z.string().uuid(),
  keyId: z.string().uuid(),
});

const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

export async function apiKeyRoutes(app: FastifyInstance): Promise<void> {
  // Admin routes for managing API keys
  // These are nested under /apps/:appId/api-keys

  // Create API key (admin or app owner)
  app.post('/apps/:appId/api-keys', { preHandler: requireAuth }, async (request, reply) => {
    const paramsResult = AppParamsSchema.safeParse(request.params);

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
    const hasAccess = await verifyAppAccess(request, reply, paramsResult.data.appId);
    if (!hasAccess) return;

    // Check for idempotent replay
    const endpoint = `POST:/apps/${paramsResult.data.appId}/api-keys`;
    const replayed = await handleIdempotentRequest(request, reply, endpoint);
    if (replayed) return;

    const bodyResult = CreateApiKeySchema.safeParse(request.body);

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

    // Get the app (already verified ownership above)
    const appData = await getAppById(paramsResult.data.appId);
    if (!appData) {
      return reply.status(404).send({
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: 'App not found',
        },
      });
    }

    const { apiKey, plainKey } = await createApiKey(
      paramsResult.data.appId,
      bodyResult.data,
      appData.sandboxMode
    );

    const responseBody = {
      success: true,
      data: {
        ...formatApiKeyResponse(apiKey),
        key: plainKey, // Only returned once at creation!
      },
      warning: 'Store this API key securely. It will not be shown again.',
    };

    // Cache response for idempotency
    await cacheSuccessResponse(request, 201, responseBody, endpoint);

    return reply.status(201).send(responseBody);
  });

  // List API keys for an app (admin or app owner)
  app.get('/apps/:appId/api-keys', { preHandler: requireAuth }, async (request, reply) => {
    const paramsResult = AppParamsSchema.safeParse(request.params);

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
    const hasAccess = await verifyAppAccess(request, reply, paramsResult.data.appId);
    if (!hasAccess) return;

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

    const result = await getApiKeysByAppId(paramsResult.data.appId, {
      limit,
      cursor,
      isActive,
    });

    return {
      success: true,
      data: result.keys.map(formatApiKeyResponse),
      cursor: result.cursor,
      hasMore: result.hasMore,
    };
  });

  // Get API key by ID (admin or app owner)
  app.get('/apps/:appId/api-keys/:keyId', { preHandler: requireAuth }, async (request, reply) => {
    const paramsResult = KeyParamsSchema.safeParse(request.params);

    if (!paramsResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: 'Invalid parameters',
          details: paramsResult.error.issues,
        },
      });
    }

    // Verify ownership for SaaS users
    const hasAccess = await verifyAppAccess(request, reply, paramsResult.data.appId);
    if (!hasAccess) return;

    const key = await getApiKeyById(paramsResult.data.keyId, paramsResult.data.appId);

    if (!key) {
      return reply.status(404).send({
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: 'API key not found',
        },
      });
    }

    return {
      success: true,
      data: formatApiKeyResponse(key),
    };
  });

  // Revoke API key (admin or app owner)
  app.post(
    '/apps/:appId/api-keys/:keyId/revoke',
    { preHandler: requireAuth },
    async (request, reply) => {
      const paramsResult = KeyParamsSchema.safeParse(request.params);

      if (!paramsResult.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message: 'Invalid parameters',
            details: paramsResult.error.issues,
          },
        });
      }

      // Verify ownership for SaaS users
      const hasAccess = await verifyAppAccess(request, reply, paramsResult.data.appId);
      if (!hasAccess) return;

      const revoked = await revokeApiKey(paramsResult.data.keyId, paramsResult.data.appId);

      if (!revoked) {
        return reply.status(404).send({
          success: false,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: 'API key not found',
          },
        });
      }

      // Get updated key to return current state
      const key = await getApiKeyById(paramsResult.data.keyId, paramsResult.data.appId);

      return {
        success: true,
        data: {
          id: key?.id,
          isActive: false,
          revokedAt: new Date().toISOString(),
        },
      };
    }
  );

  // Delete API key (admin or app owner)
  app.delete(
    '/apps/:appId/api-keys/:keyId',
    { preHandler: requireAuth },
    async (request, reply) => {
      const paramsResult = KeyParamsSchema.safeParse(request.params);

      if (!paramsResult.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message: 'Invalid parameters',
            details: paramsResult.error.issues,
          },
        });
      }

      // Verify ownership for SaaS users
      const hasAccess = await verifyAppAccess(request, reply, paramsResult.data.appId);
      if (!hasAccess) return;

      const deleted = await deleteApiKey(paramsResult.data.keyId, paramsResult.data.appId);

      if (!deleted) {
        return reply.status(404).send({
          success: false,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: 'API key not found',
          },
        });
      }

      return reply.status(204).send();
    }
  );

  // Rotate API key (admin or app owner)
  app.post(
    '/apps/:appId/api-keys/:keyId/rotate',
    { preHandler: requireAuth },
    async (request, reply) => {
      const paramsResult = KeyParamsSchema.safeParse(request.params);

      if (!paramsResult.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message: 'Invalid parameters',
            details: paramsResult.error.issues,
          },
        });
      }

      // Verify ownership for SaaS users
      const hasAccess = await verifyAppAccess(request, reply, paramsResult.data.appId);
      if (!hasAccess) return;

      const result = await rotateApiKey(paramsResult.data.keyId, paramsResult.data.appId);

      if (!result) {
        return reply.status(404).send({
          success: false,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: 'API key not found',
          },
        });
      }

      return {
        success: true,
        data: {
          ...formatApiKeyResponse(result.apiKey),
          key: result.plainKey, // New key, only shown once!
        },
        warning: 'Store this new API key securely. It will not be shown again.',
      };
    }
  );

  // Self-service API key routes (for apps to manage their own keys)
  // These routes use the authenticated app's ID

  // List own API keys
  app.get('/api-keys', { preHandler: requireAuth }, async (request, reply) => {
    if (!request.appId) {
      return reply.status(401).send({
        success: false,
        error: {
          code: ErrorCodes.UNAUTHORIZED,
          message: 'App authentication required',
        },
      });
    }

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

    const result = await getApiKeysByAppId(request.appId, {
      limit,
      cursor,
      isActive,
    });

    return {
      success: true,
      data: result.keys.map(formatApiKeyResponse),
      cursor: result.cursor,
      hasMore: result.hasMore,
    };
  });
}
