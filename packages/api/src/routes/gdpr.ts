import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createGdprRequest,
  getGdprRequest,
  listGdprRequests,
  processGdprRequest,
  cancelGdprRequest,
  exportDataForEmail,
  deleteDataForEmail,
  type GdprRequestType,
  type GdprRequestStatus,
} from '../services/gdpr.service.js';
import { requireAdminAuth, requireScope } from '../middleware/auth.js';
import { logAuditEvent, AuditActions } from '../middleware/audit.js';

const CreateRequestSchema = z.object({
  emailAddress: z.string().email(),
  requestType: z.enum(['export', 'delete', 'rectify', 'access']),
  metadata: z
    .object({
      reason: z.string().optional(),
      verificationMethod: z.string().optional(),
      verificationReference: z.string().optional(),
      notes: z.string().optional(),
    })
    .optional(),
});

const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
  emailAddress: z.string().email().optional(),
  requestType: z.enum(['export', 'delete', 'rectify', 'access']).optional(),
  status: z.enum(['pending', 'processing', 'completed', 'failed', 'cancelled']).optional(),
});

const ParamsSchema = z.object({
  id: z.string().uuid(),
});

const ExportQuerySchema = z.object({
  emailAddress: z.string().email(),
});

const DeleteBodySchema = z.object({
  emailAddress: z.string().email(),
  addToSuppression: z.boolean().default(true),
});

export async function gdprRoutes(app: FastifyInstance): Promise<void> {
  // ========================================
  // GDPR Request Management (Admin Only)
  // ========================================

  // List GDPR requests
  app.get('/gdpr/requests', { preHandler: requireAdminAuth }, async (request, reply) => {
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

    const { limit, cursor, emailAddress, requestType, status } = queryResult.data;

    const result = await listGdprRequests({
      appId: request.appId, // Will be null for admin, scoped for app
      emailAddress,
      requestType: requestType as GdprRequestType | undefined,
      status: status as GdprRequestStatus | undefined,
      limit,
      cursor,
    });

    return {
      success: true,
      data: result.requests.map((req) => ({
        id: req.id,
        appId: req.appId,
        emailAddress: req.emailAddress,
        requestType: req.requestType,
        status: req.status,
        requestedBy: req.requestedBy,
        metadata: req.metadata,
        result: req.result,
        processedAt: req.processedAt?.toISOString() ?? null,
        completedAt: req.completedAt?.toISOString() ?? null,
        createdAt: req.createdAt.toISOString(),
        updatedAt: req.updatedAt.toISOString(),
      })),
      cursor: result.cursor,
      hasMore: result.hasMore,
    };
  });

  // Create GDPR request
  app.post('/gdpr/requests', { preHandler: requireAdminAuth }, async (request, reply) => {
    const bodyResult = CreateRequestSchema.safeParse(request.body);

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

    const { emailAddress, requestType, metadata } = bodyResult.data;

    const gdprRequest = await createGdprRequest({
      appId: request.appId ?? undefined,
      emailAddress,
      requestType,
      requestedBy: request.userId ?? 'admin',
      metadata,
    });

    // Log audit event
    await logAuditEvent(
      request,
      requestType === 'delete'
        ? AuditActions.GDPR_DELETE_REQUEST
        : AuditActions.GDPR_EXPORT_REQUEST,
      'gdpr_request',
      gdprRequest.id,
      { after: { emailAddress, requestType } }
    );

    return reply.status(201).send({
      success: true,
      data: {
        id: gdprRequest.id,
        appId: gdprRequest.appId,
        emailAddress: gdprRequest.emailAddress,
        requestType: gdprRequest.requestType,
        status: gdprRequest.status,
        requestedBy: gdprRequest.requestedBy,
        metadata: gdprRequest.metadata,
        createdAt: gdprRequest.createdAt.toISOString(),
      },
    });
  });

  // Get GDPR request by ID
  app.get('/gdpr/requests/:id', { preHandler: requireAdminAuth }, async (request, reply) => {
    const paramsResult = ParamsSchema.safeParse(request.params);

    if (!paramsResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request ID',
          details: paramsResult.error.issues,
        },
      });
    }

    const gdprRequest = await getGdprRequest(paramsResult.data.id);

    if (!gdprRequest) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'GDPR request not found',
        },
      });
    }

    return {
      success: true,
      data: {
        id: gdprRequest.id,
        appId: gdprRequest.appId,
        emailAddress: gdprRequest.emailAddress,
        requestType: gdprRequest.requestType,
        status: gdprRequest.status,
        requestedBy: gdprRequest.requestedBy,
        metadata: gdprRequest.metadata,
        result: gdprRequest.result,
        processedAt: gdprRequest.processedAt?.toISOString() ?? null,
        completedAt: gdprRequest.completedAt?.toISOString() ?? null,
        createdAt: gdprRequest.createdAt.toISOString(),
        updatedAt: gdprRequest.updatedAt.toISOString(),
      },
    };
  });

  // Process GDPR request
  app.post(
    '/gdpr/requests/:id/process',
    { preHandler: requireAdminAuth },
    async (request, reply) => {
      const paramsResult = ParamsSchema.safeParse(request.params);

      if (!paramsResult.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request ID',
            details: paramsResult.error.issues,
          },
        });
      }

      const gdprRequest = await processGdprRequest(paramsResult.data.id);

      if (!gdprRequest) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'GDPR request not found',
          },
        });
      }

      // Log completion
      if (gdprRequest.status === 'completed') {
        await logAuditEvent(
          request,
          gdprRequest.requestType === 'delete'
            ? AuditActions.GDPR_DELETE_COMPLETE
            : AuditActions.GDPR_EXPORT_COMPLETE,
          'gdpr_request',
          gdprRequest.id,
          { after: { emailAddress: gdprRequest.emailAddress, result: gdprRequest.result } }
        );
      }

      return {
        success: true,
        data: {
          id: gdprRequest.id,
          status: gdprRequest.status,
          result: gdprRequest.result,
          processedAt: gdprRequest.processedAt?.toISOString() ?? null,
          completedAt: gdprRequest.completedAt?.toISOString() ?? null,
        },
      };
    }
  );

  // Cancel GDPR request
  app.post(
    '/gdpr/requests/:id/cancel',
    { preHandler: requireAdminAuth },
    async (request, reply) => {
      const paramsResult = ParamsSchema.safeParse(request.params);

      if (!paramsResult.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request ID',
            details: paramsResult.error.issues,
          },
        });
      }

      try {
        const gdprRequest = await cancelGdprRequest(paramsResult.data.id);

        if (!gdprRequest) {
          return reply.status(404).send({
            success: false,
            error: {
              code: 'NOT_FOUND',
              message: 'GDPR request not found',
            },
          });
        }

        return {
          success: true,
          data: {
            id: gdprRequest.id,
            status: gdprRequest.status,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.status(400).send({
          success: false,
          error: {
            code: 'BAD_REQUEST',
            message,
          },
        });
      }
    }
  );

  // ========================================
  // Direct Data Operations (Admin Only)
  // ========================================

  // Export data for email address (immediate)
  app.get('/gdpr/export', { preHandler: requireAdminAuth }, async (request, reply) => {
    const queryResult = ExportQuerySchema.safeParse(request.query);

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

    const { emailAddress } = queryResult.data;

    const exportData = await exportDataForEmail(request.appId ?? null, emailAddress);

    // Log audit event
    await logAuditEvent(request, AuditActions.GDPR_EXPORT_COMPLETE, 'gdpr_export', undefined, {
      after: {
        emailAddress,
        summary: exportData.summary,
      },
    });

    return {
      success: true,
      data: exportData,
    };
  });

  // Delete data for email address (immediate)
  app.delete('/gdpr/data', { preHandler: requireAdminAuth }, async (request, reply) => {
    const bodyResult = DeleteBodySchema.safeParse(request.body);

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

    const { emailAddress, addToSuppression } = bodyResult.data;

    const result = await deleteDataForEmail(request.appId ?? null, emailAddress, {
      addToSuppression,
    });

    // Log audit event
    await logAuditEvent(request, AuditActions.GDPR_DELETE_COMPLETE, 'gdpr_deletion', undefined, {
      after: {
        emailAddress,
        ...result,
      },
    });

    return {
      success: true,
      data: result,
    };
  });

  // ========================================
  // App-scoped GDPR endpoints (with scope)
  // ========================================

  // Check data for email (app-scoped)
  app.get(
    '/gdpr/check/:email',
    { preHandler: requireScope('suppression:manage') },
    async (request, reply) => {
      const { email } = request.params as { email: string };

      if (!request.appId) {
        return reply.status(403).send({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'This endpoint requires app authentication',
          },
        });
      }

      // Use export to check what data exists
      const exportData = await exportDataForEmail(request.appId, email);

      return {
        success: true,
        data: {
          emailAddress: email,
          hasData:
            exportData.summary.totalEmails > 0 || exportData.summary.totalSuppressionEntries > 0,
          summary: exportData.summary,
        },
      };
    }
  );
}
