import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ApiKeyScope } from '@mail-queue/core';
import jwt from 'jsonwebtoken';
import {
  validateApiKey,
  hasScope,
  hasAnyScope,
  checkIpAllowlist,
  type ApiKeyWithApp,
} from '../services/apikey.service.js';
import { config } from '../config.js';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    apiKey?: ApiKeyWithApp;
    appId?: string;
    isAdmin?: boolean;
    userId?: string;
    userRole?: string;
  }
}

export async function authPlugin(app: FastifyInstance): Promise<void> {
  app.decorateRequest('apiKey', undefined);
  app.decorateRequest('appId', undefined);
  app.decorateRequest('isAdmin', false);
  app.decorateRequest('userId', undefined);
  app.decorateRequest('userRole', undefined);
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
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

  // Try to validate as API key first
  const apiKey = await validateApiKey(apiKeyString);

  if (apiKey) {
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

    // Attach API key to request
    request.apiKey = apiKey;
    request.appId = apiKey.appId;
    return;
  }

  // Try to validate as JWT token (for dashboard users)
  try {
    const payload = jwt.verify(apiKeyString, config.jwtSecret) as JwtPayload;
    request.userId = payload.sub;
    request.userRole = payload.role;
    // Dashboard users with super_admin or admin role get admin access
    if (payload.role === 'super_admin' || payload.role === 'admin') {
      request.isAdmin = true;
    }
    return;
  } catch {
    // JWT verification failed
  }

  // Neither API key nor JWT was valid
  reply.status(401).send({
    success: false,
    error: {
      code: 'UNAUTHORIZED',
      message: 'Invalid or expired token',
    },
  });
}

export async function requireAdminAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  await requireAuth(request, reply);

  // Already sent a response
  if (reply.sent) return;

  if (!request.isAdmin && (!request.apiKey || !hasScope(request.apiKey, 'admin'))) {
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

    if (!request.apiKey || !hasScope(request.apiKey, scope)) {
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

    if (!request.apiKey || !hasAnyScope(request.apiKey, scopes)) {
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

export async function optionalAuth(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
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
    return;
  }

  // Try to validate as JWT token (for dashboard users)
  try {
    const payload = jwt.verify(apiKeyString, config.jwtSecret) as JwtPayload;
    request.userId = payload.sub;
    request.userRole = payload.role;
    if (payload.role === 'super_admin' || payload.role === 'admin') {
      request.isAdmin = true;
    }
  } catch {
    // JWT verification failed, but this is optional auth so we don't error
  }
}
