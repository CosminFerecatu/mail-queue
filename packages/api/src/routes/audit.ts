import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  listAuditLogs,
  getAuditLog,
  getResourceAuditTrail,
  type ActorType,
} from '../services/audit.service.js';
import { requireAdminAuth } from '../middleware/auth.js';

const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  actorId: z.string().uuid().optional(),
  actorType: z.enum(['user', 'app', 'system']).optional(),
  action: z.string().optional(),
  resourceType: z.string().optional(),
  resourceId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  search: z.string().optional(),
});

const ParamsSchema = z.object({
  id: z.string().uuid(),
});

const ResourceTrailQuerySchema = z.object({
  resourceType: z.string(),
  resourceId: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export async function auditRoutes(app: FastifyInstance): Promise<void> {
  // All audit routes require admin auth
  app.addHook('preHandler', requireAdminAuth);

  // List audit logs with filtering
  app.get('/audit-logs', async (request, reply) => {
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

    const {
      limit,
      offset,
      actorId,
      actorType,
      action,
      resourceType,
      resourceId,
      from,
      to,
      search,
    } = queryResult.data;

    const result = await listAuditLogs({
      limit,
      offset,
      actorId,
      actorType: actorType as ActorType | undefined,
      action,
      resourceType,
      resourceId,
      from,
      to,
      search,
    });

    return {
      success: true,
      data: result.entries.map((entry) => ({
        id: entry.id,
        actorType: entry.actorType,
        actorId: entry.actorId,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        changes: entry.changes,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
        createdAt: entry.createdAt.toISOString(),
      })),
      pagination: {
        total: result.total,
        limit,
        offset,
        hasMore: result.hasMore,
      },
    };
  });

  // Get single audit log entry
  app.get('/audit-logs/:id', async (request, reply) => {
    const paramsResult = ParamsSchema.safeParse(request.params);

    if (!paramsResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid audit log ID',
          details: paramsResult.error.issues,
        },
      });
    }

    const entry = await getAuditLog(paramsResult.data.id);

    if (!entry) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Audit log entry not found',
        },
      });
    }

    return {
      success: true,
      data: {
        id: entry.id,
        actorType: entry.actorType,
        actorId: entry.actorId,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        changes: entry.changes,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
        createdAt: entry.createdAt.toISOString(),
      },
    };
  });

  // Get audit trail for a specific resource
  app.get('/audit-logs/resource', async (request, reply) => {
    const queryResult = ResourceTrailQuerySchema.safeParse(request.query);

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

    const { resourceType, resourceId, limit } = queryResult.data;

    const entries = await getResourceAuditTrail(resourceType, resourceId, limit);

    return {
      success: true,
      data: entries.map((entry) => ({
        id: entry.id,
        actorType: entry.actorType,
        actorId: entry.actorId,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        changes: entry.changes,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
        createdAt: entry.createdAt.toISOString(),
      })),
    };
  });
}
