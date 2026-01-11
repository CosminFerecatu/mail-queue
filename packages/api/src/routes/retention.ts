import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  getRetentionPolicies,
  getAppRetentionPolicy,
  updateAppRetentionPolicy,
  cleanupAppEmails,
  runGlobalCleanup,
  getRetentionStats,
} from '../services/retention.service.js';
import { requireAdminAuth } from '../middleware/auth.js';
import { logAuditEvent } from '../middleware/audit.js';

const AppIdParamsSchema = z.object({
  appId: z.string().uuid(),
});

const UpdateRetentionSchema = z.object({
  retentionDays: z.number().int().min(1).max(3650), // 1 day to 10 years
});

const CleanupQuerySchema = z.object({
  dryRun: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

export async function retentionRoutes(app: FastifyInstance): Promise<void> {
  // All retention routes require admin auth
  app.addHook('preHandler', requireAdminAuth);

  // List all app retention policies
  app.get('/retention/policies', async () => {
    const policies = await getRetentionPolicies();

    return {
      success: true,
      data: policies.map((p) => ({
        appId: p.appId,
        appName: p.appName,
        retentionDays: p.retentionDays,
      })),
    };
  });

  // Get retention policy for a specific app
  app.get('/retention/policies/:appId', async (request, reply) => {
    const paramsResult = AppIdParamsSchema.safeParse(request.params);

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

    const policy = await getAppRetentionPolicy(paramsResult.data.appId);

    if (!policy) {
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
        appId: policy.appId,
        appName: policy.appName,
        retentionDays: policy.retentionDays,
      },
    };
  });

  // Update retention policy for an app
  app.patch('/retention/policies/:appId', async (request, reply) => {
    const paramsResult = AppIdParamsSchema.safeParse(request.params);

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

    const bodyResult = UpdateRetentionSchema.safeParse(request.body);

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

    const updated = await updateAppRetentionPolicy(
      paramsResult.data.appId,
      bodyResult.data.retentionDays
    );

    if (!updated) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'App not found',
        },
      });
    }

    // Log audit event
    await logAuditEvent(request, 'retention.policy_update', 'app', paramsResult.data.appId, {
      after: { retentionDays: bodyResult.data.retentionDays },
    });

    const policy = await getAppRetentionPolicy(paramsResult.data.appId);

    return {
      success: true,
      data: policy,
    };
  });

  // Get retention stats for an app (what would be deleted)
  app.get('/retention/stats/:appId', async (request, reply) => {
    const paramsResult = AppIdParamsSchema.safeParse(request.params);

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

    const stats = await getRetentionStats(paramsResult.data.appId);

    if (!stats.policy) {
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
        policy: stats.policy,
        pendingDeletion: {
          emails: stats.emailsBeforeCutoff,
          events: stats.eventsBeforeCutoff,
          estimatedSize: stats.estimatedDeletionSize,
        },
      },
    };
  });

  // Run cleanup for a specific app
  app.post('/retention/cleanup/:appId', async (request, reply) => {
    const paramsResult = AppIdParamsSchema.safeParse(request.params);

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

    const queryResult = CleanupQuerySchema.safeParse(request.query);
    const dryRun = queryResult.success ? queryResult.data.dryRun : false;

    const policy = await getAppRetentionPolicy(paramsResult.data.appId);

    if (!policy) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'App not found',
        },
      });
    }

    if (dryRun) {
      // Return stats instead of actually deleting
      const stats = await getRetentionStats(paramsResult.data.appId);
      return {
        success: true,
        data: {
          dryRun: true,
          wouldDelete: {
            emails: stats.emailsBeforeCutoff,
            events: stats.eventsBeforeCutoff,
          },
        },
      };
    }

    const result = await cleanupAppEmails(paramsResult.data.appId, policy.retentionDays);

    // Log audit event
    await logAuditEvent(request, 'retention.cleanup', 'app', paramsResult.data.appId, {
      after: {
        emailsDeleted: result.emailsDeleted,
        eventsDeleted: result.eventsDeleted,
        trackingLinksDeleted: result.trackingLinksDeleted,
        cutoffDate: result.cutoffDate.toISOString(),
      },
    });

    return {
      success: true,
      data: {
        appId: result.appId,
        appName: result.appName,
        emailsDeleted: result.emailsDeleted,
        eventsDeleted: result.eventsDeleted,
        trackingLinksDeleted: result.trackingLinksDeleted,
        cutoffDate: result.cutoffDate.toISOString(),
      },
    };
  });

  // Run global cleanup for all apps and system data
  // This endpoint is designed to be called by a cron job or scheduler
  app.post('/retention/cleanup', async (request, _reply) => {
    const queryResult = CleanupQuerySchema.safeParse(request.query);
    const dryRun = queryResult.success ? queryResult.data.dryRun : false;

    if (dryRun) {
      // Return policies and estimated stats
      const policies = await getRetentionPolicies();
      const stats = await Promise.all(
        policies.map(async (p) => ({
          ...p,
          ...(await getRetentionStats(p.appId)),
        }))
      );

      return {
        success: true,
        data: {
          dryRun: true,
          policies: stats.map((s) => ({
            appId: s.appId,
            appName: s.appName,
            retentionDays: s.retentionDays,
            wouldDelete: {
              emails: s.emailsBeforeCutoff,
              events: s.eventsBeforeCutoff,
            },
          })),
        },
      };
    }

    const result = await runGlobalCleanup();

    // Log audit event
    await logAuditEvent(request, 'retention.global_cleanup', 'system', undefined, {
      after: {
        appsProcessed: result.appsProcessed,
        totalEmailsDeleted: result.totalEmailsDeleted,
        totalEventsDeleted: result.totalEventsDeleted,
        auditLogsDeleted: result.auditLogsDeleted,
        expiredSuppressionsDeleted: result.expiredSuppressionsDeleted,
        webhookDeliveriesDeleted: result.webhookDeliveriesDeleted,
        gdprRequestsCleaned: result.gdprRequestsCleaned,
      },
    });

    return {
      success: true,
      data: {
        appsProcessed: result.appsProcessed,
        totalEmailsDeleted: result.totalEmailsDeleted,
        totalEventsDeleted: result.totalEventsDeleted,
        totalTrackingLinksDeleted: result.totalTrackingLinksDeleted,
        auditLogsDeleted: result.auditLogsDeleted,
        expiredSuppressionsDeleted: result.expiredSuppressionsDeleted,
        webhookDeliveriesDeleted: result.webhookDeliveriesDeleted,
        gdprRequestsCleaned: result.gdprRequestsCleaned,
        appResults: result.results.map((r) => ({
          appId: r.appId,
          appName: r.appName,
          emailsDeleted: r.emailsDeleted,
          eventsDeleted: r.eventsDeleted,
          trackingLinksDeleted: r.trackingLinksDeleted,
          cutoffDate: r.cutoffDate.toISOString(),
        })),
      },
    };
  });
}
