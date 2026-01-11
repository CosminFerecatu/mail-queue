import type { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { getSaasUserById } from '../services/saas-user.service.js';

// Extend FastifyRequest to include SaaS user info
declare module 'fastify' {
  interface FastifyRequest {
    saasUserId?: string;
    accountId?: string;
    accountRole?: 'owner' | 'admin' | 'editor' | 'viewer';
  }
}

interface SaaSJWTPayload {
  sub: string; // user ID
  email: string;
  accountId?: string;
  accountRole?: 'owner' | 'admin' | 'editor' | 'viewer';
}

// Middleware to require SaaS authentication
export async function requireSaaSAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return reply.status(401).send({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing or invalid authorization header',
      },
    });
  }

  const token = authHeader.substring(7);

  try {
    // Try to verify as SaaS JWT first
    const payload = jwt.verify(token, config.jwtSecret) as SaaSJWTPayload;

    // Check if this is a SaaS token (has sub and accountId pattern)
    if (payload.sub) {
      // Verify user exists and get fresh account info
      const userData = await getSaasUserById(payload.sub);

      if (!userData) {
        return reply.status(401).send({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
          },
        });
      }

      request.saasUserId = payload.sub;
      request.accountId = userData.account?.id;
      request.accountRole = userData.account?.role;
      return;
    }

    // Invalid token format
    return reply.status(401).send({
      success: false,
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid token format',
      },
    });
  } catch {
    return reply.status(401).send({
      success: false,
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired token',
      },
    });
  }
}

// Middleware to require account owner role
export async function requireAccountOwner(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (request.accountRole !== 'owner') {
    return reply.status(403).send({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'This action requires account owner permissions',
      },
    });
  }
}

// Middleware to require admin or owner role
export async function requireAccountAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!['owner', 'admin'].includes(request.accountRole ?? '')) {
    return reply.status(403).send({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'This action requires admin permissions',
      },
    });
  }
}

// Middleware to require editor or higher role
export async function requireAccountEditor(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!['owner', 'admin', 'editor'].includes(request.accountRole ?? '')) {
    return reply.status(403).send({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'This action requires editor permissions',
      },
    });
  }
}

// Check if user has specific permission
export function hasPermission(
  role: 'owner' | 'admin' | 'editor' | 'viewer' | undefined,
  permission: string
): boolean {
  if (!role) return false;

  const rolePermissions: Record<string, string[]> = {
    owner: [
      'apps:read',
      'apps:write',
      'apps:delete',
      'queues:read',
      'queues:write',
      'queues:delete',
      'emails:read',
      'emails:write',
      'emails:delete',
      'analytics:read',
      'api_keys:read',
      'api_keys:write',
      'team:read',
      'team:write',
      'settings:read',
      'settings:write',
      'billing:read',
      'billing:write',
    ],
    admin: [
      'apps:read',
      'apps:write',
      'apps:delete',
      'queues:read',
      'queues:write',
      'queues:delete',
      'emails:read',
      'emails:write',
      'emails:delete',
      'analytics:read',
      'api_keys:read',
      'api_keys:write',
      'team:read',
      'team:write',
      'settings:read',
      'settings:write',
    ],
    editor: [
      'apps:read',
      'queues:read',
      'queues:write',
      'emails:read',
      'emails:write',
      'analytics:read',
      'api_keys:read',
    ],
    viewer: ['apps:read', 'queues:read', 'emails:read', 'analytics:read'],
  };

  return rolePermissions[role]?.includes(permission) ?? false;
}
