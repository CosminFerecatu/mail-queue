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
} from '../services/apikey.service.js';
import { getAppById } from '../services/app.service.js';
import { requireAdminAuth, requireAuth } from '../middleware/auth.js';
import { handleIdempotentRequest, cacheSuccessResponse } from '../lib/idempotency.js';

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

  // Create API key (admin only)
  app.post('/apps/:appId/api-keys', { preHandler: requireAdminAuth }, async (request, reply) => {
    const paramsResult = AppParamsSchema.safeParse(request.params);

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

    // Check for idempotent replay
    const endpoint = `POST:/apps/${paramsResult.data.appId}/api-keys`;
    const replayed = await handleIdempotentRequest(request, reply, endpoint);
    if (replayed) return;

    const bodyResult = CreateApiKeySchema.safeParse(request.body);

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

    // Check if app exists
    const appData = await getAppById(paramsResult.data.appId);
    if (!appData) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'NOT_FOUND',
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
        id: apiKey.id,
        name: apiKey.name,
        key: plainKey, // Only returned once at creation!
        keyPrefix: apiKey.keyPrefix,
        scopes: apiKey.scopes,
        rateLimit: apiKey.rateLimit,
        ipAllowlist: apiKey.ipAllowlist,
        expiresAt: apiKey.expiresAt,
        isActive: apiKey.isActive,
        createdAt: apiKey.createdAt,
      },
      warning: 'Store this API key securely. It will not be shown again.',
    };

    // Cache response for idempotency
    await cacheSuccessResponse(request, 201, responseBody, endpoint);

    return reply.status(201).send(responseBody);
  });

  // List API keys for an app (admin only)
  app.get('/apps/:appId/api-keys', { preHandler: requireAdminAuth }, async (request, reply) => {
    const paramsResult = AppParamsSchema.safeParse(request.params);

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

    const result = await getApiKeysByAppId(paramsResult.data.appId, {
      limit,
      cursor,
      isActive,
    });

    return {
      success: true,
      data: result.keys.map((k) => ({
        id: k.id,
        name: k.name,
        keyPrefix: k.keyPrefix,
        scopes: k.scopes,
        rateLimit: k.rateLimit,
        ipAllowlist: k.ipAllowlist,
        expiresAt: k.expiresAt,
        isActive: k.isActive,
        createdAt: k.createdAt,
        lastUsedAt: k.lastUsedAt,
      })),
      cursor: result.cursor,
      hasMore: result.hasMore,
    };
  });

  // Get API key by ID (admin only)
  app.get(
    '/apps/:appId/api-keys/:keyId',
    { preHandler: requireAdminAuth },
    async (request, reply) => {
      const paramsResult = KeyParamsSchema.safeParse(request.params);

      if (!paramsResult.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid parameters',
            details: paramsResult.error.issues,
          },
        });
      }

      const key = await getApiKeyById(paramsResult.data.keyId, paramsResult.data.appId);

      if (!key) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'API key not found',
          },
        });
      }

      return {
        success: true,
        data: {
          id: key.id,
          name: key.name,
          keyPrefix: key.keyPrefix,
          scopes: key.scopes,
          rateLimit: key.rateLimit,
          ipAllowlist: key.ipAllowlist,
          expiresAt: key.expiresAt,
          isActive: key.isActive,
          createdAt: key.createdAt,
          lastUsedAt: key.lastUsedAt,
        },
      };
    }
  );

  // Revoke API key (admin only)
  app.post(
    '/apps/:appId/api-keys/:keyId/revoke',
    { preHandler: requireAdminAuth },
    async (request, reply) => {
      const paramsResult = KeyParamsSchema.safeParse(request.params);

      if (!paramsResult.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid parameters',
            details: paramsResult.error.issues,
          },
        });
      }

      const revoked = await revokeApiKey(paramsResult.data.keyId, paramsResult.data.appId);

      if (!revoked) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'NOT_FOUND',
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

  // Delete API key (admin only)
  app.delete(
    '/apps/:appId/api-keys/:keyId',
    { preHandler: requireAdminAuth },
    async (request, reply) => {
      const paramsResult = KeyParamsSchema.safeParse(request.params);

      if (!paramsResult.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid parameters',
            details: paramsResult.error.issues,
          },
        });
      }

      const deleted = await deleteApiKey(paramsResult.data.keyId, paramsResult.data.appId);

      if (!deleted) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'API key not found',
          },
        });
      }

      return reply.status(204).send();
    }
  );

  // Rotate API key (admin only)
  app.post(
    '/apps/:appId/api-keys/:keyId/rotate',
    { preHandler: requireAdminAuth },
    async (request, reply) => {
      const paramsResult = KeyParamsSchema.safeParse(request.params);

      if (!paramsResult.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid parameters',
            details: paramsResult.error.issues,
          },
        });
      }

      const result = await rotateApiKey(paramsResult.data.keyId, paramsResult.data.appId);

      if (!result) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'API key not found',
          },
        });
      }

      return {
        success: true,
        data: {
          id: result.apiKey.id,
          name: result.apiKey.name,
          key: result.plainKey, // New key, only shown once!
          keyPrefix: result.apiKey.keyPrefix,
          scopes: result.apiKey.scopes,
          rateLimit: result.apiKey.rateLimit,
          ipAllowlist: result.apiKey.ipAllowlist,
          expiresAt: result.apiKey.expiresAt,
          isActive: result.apiKey.isActive,
          createdAt: result.apiKey.createdAt,
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

    const { limit, cursor, isActive } = queryResult.data;

    const result = await getApiKeysByAppId(request.appId, {
      limit,
      cursor,
      isActive,
    });

    return {
      success: true,
      data: result.keys.map((k) => ({
        id: k.id,
        name: k.name,
        keyPrefix: k.keyPrefix,
        scopes: k.scopes,
        rateLimit: k.rateLimit,
        ipAllowlist: k.ipAllowlist,
        expiresAt: k.expiresAt,
        isActive: k.isActive,
        createdAt: k.createdAt,
        lastUsedAt: k.lastUsedAt,
      })),
      cursor: result.cursor,
      hasMore: result.hasMore,
    };
  });
}
