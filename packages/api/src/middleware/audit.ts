import type { FastifyRequest } from 'fastify';
import { createAuditLog, AuditActions, type ActorType } from '../services/audit.service.js';
import { logger } from '../lib/logger.js';

/**
 * Extracts client IP address from request
 */
function getClientIp(request: FastifyRequest): string | undefined {
  // Check common proxy headers
  const forwardedFor = request.headers['x-forwarded-for'];
  if (forwardedFor) {
    const ips = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor.split(',')[0];
    return ips?.trim();
  }

  const realIp = request.headers['x-real-ip'];
  if (realIp) {
    return Array.isArray(realIp) ? realIp[0] : realIp;
  }

  return request.ip;
}

/**
 * Extracts actor info from request based on authentication method
 */
function getActorInfo(request: FastifyRequest): { actorType: ActorType; actorId: string } | null {
  // Check for user (JWT) authentication
  if (request.userId) {
    return {
      actorType: 'user',
      actorId: request.userId,
    };
  }

  // Check for app (API key) authentication
  if (request.appId) {
    return {
      actorType: 'app',
      actorId: request.appId,
    };
  }

  // No authenticated actor
  return null;
}

/**
 * Hook to log audit events after successful mutations
 * Call this after completing a mutation operation
 */
export async function logAuditEvent(
  request: FastifyRequest,
  action: string,
  resourceType: string,
  resourceId?: string,
  changes?: { before?: Record<string, unknown>; after?: Record<string, unknown> }
): Promise<void> {
  const actor = getActorInfo(request);
  if (!actor) {
    logger.debug({ action, resourceType }, 'Skipping audit log - no authenticated actor');
    return;
  }

  try {
    await createAuditLog({
      actorType: actor.actorType,
      actorId: actor.actorId,
      action,
      resourceType,
      resourceId,
      changes,
      ipAddress: getClientIp(request),
      userAgent: request.headers['user-agent'],
    });
  } catch (error) {
    // Don't fail the request if audit logging fails
    logger.error({ error, action, resourceType, resourceId }, 'Failed to create audit log');
  }
}

/**
 * Hook to log authentication events
 */
export async function logAuthEvent(
  request: FastifyRequest,
  action: string,
  userId: string,
  success: boolean,
  details?: Record<string, unknown>
): Promise<void> {
  try {
    await createAuditLog({
      actorType: 'user',
      actorId: userId,
      action: success ? action : `${action}_failed`,
      resourceType: 'auth',
      resourceId: userId,
      changes: details ? { after: details } : undefined,
      ipAddress: getClientIp(request),
      userAgent: request.headers['user-agent'],
    });
  } catch (error) {
    logger.error({ error, action, userId }, 'Failed to create auth audit log');
  }
}

/**
 * Hook to log system events (scheduled jobs, workers, etc.)
 */
export async function logSystemEvent(
  action: string,
  resourceType: string,
  resourceId?: string,
  details?: Record<string, unknown>
): Promise<void> {
  try {
    await createAuditLog({
      actorType: 'system',
      actorId: 'system',
      action,
      resourceType,
      resourceId,
      changes: details ? { after: details } : undefined,
    });
  } catch (error) {
    logger.error({ error, action, resourceType }, 'Failed to create system audit log');
  }
}

/**
 * Prebuilt audit actions for common operations
 */
export { AuditActions };

// Note: FastifyRequest type augmentation is in ./auth.ts
// This module uses the same augmented types (userId, userRole, appId, isAdmin)
