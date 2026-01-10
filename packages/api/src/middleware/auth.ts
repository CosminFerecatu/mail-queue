import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ApiKeyScope } from '@mail-queue/core';
import { validateApiKey, hasScope, hasAnyScope, checkIpAllowlist, type ApiKeyWithApp } from '../services/apikey.service.js';
import { config } from '../config.js';

declare module 'fastify' {
  interface FastifyRequest {
    apiKey?: ApiKeyWithApp;
    appId?: string;
    isAdmin?: boolean;
  }
}

export async function authPlugin(app: FastifyInstance): Promise<void> {
  app.decorateRequest('apiKey', undefined);
  app.decorateRequest('appId', undefined);
  app.decorateRequest('isAdmin', false);
}

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader) {
    reply.status(401).send({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing Authorization header',
      },
    });
    return;
  }

  // Check for admin secret (for internal/admin operations)
  if (authHeader === `Bearer ${config.adminSecret}`) {
    request.isAdmin = true;
    return;
  }

  // Extract bearer token
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0]?.toLowerCase() !== 'bearer') {
    reply.status(401).send({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid Authorization header format. Use: Bearer <api_key>',
      },
    });
    return;
  }

  const apiKeyString = parts[1];
  if (!apiKeyString) {
    reply.status(401).send({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing API key',
      },
    });
    return;
  }

  // Validate API key
  const apiKey = await validateApiKey(apiKeyString);

  if (!apiKey) {
    reply.status(401).send({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired API key',
      },
    });
    return;
  }

  // Check IP allowlist
  const clientIp = request.ip;
  if (!checkIpAllowlist(apiKey, clientIp)) {
    reply.status(403).send({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Request from this IP address is not allowed',
      },
    });
    return;
  }

  // Attach to request
  request.apiKey = apiKey;
  request.appId = apiKey.appId;
}

export async function requireAdminAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  await requireAuth(request, reply);

  // Already sent a response
  if (reply.sent) return;

  if (!request.isAdmin && !hasScope(request.apiKey!, 'admin')) {
    reply.status(403).send({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Admin access required',
      },
    });
  }
}

export function requireScope(scope: ApiKeyScope) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await requireAuth(request, reply);

    // Already sent a response
    if (reply.sent) return;

    // Admin always has access
    if (request.isAdmin) return;

    if (!hasScope(request.apiKey!, scope)) {
      reply.status(403).send({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Missing required scope: ${scope}`,
        },
      });
    }
  };
}

export function requireAnyScope(scopes: ApiKeyScope[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await requireAuth(request, reply);

    // Already sent a response
    if (reply.sent) return;

    // Admin always has access
    if (request.isAdmin) return;

    if (!hasAnyScope(request.apiKey!, scopes)) {
      reply.status(403).send({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Missing required scope. One of: ${scopes.join(', ')}`,
        },
      });
    }
  };
}

export async function optionalAuth(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader) {
    return;
  }

  // Check for admin secret
  if (authHeader === `Bearer ${config.adminSecret}`) {
    request.isAdmin = true;
    return;
  }

  // Extract bearer token
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0]?.toLowerCase() !== 'bearer') {
    return;
  }

  const apiKeyString = parts[1];
  if (!apiKeyString) {
    return;
  }

  // Try to validate API key
  const apiKey = await validateApiKey(apiKeyString);

  if (apiKey && checkIpAllowlist(apiKey, request.ip)) {
    request.apiKey = apiKey;
    request.appId = apiKey.appId;
  }
}
