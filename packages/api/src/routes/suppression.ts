import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import {
  addToSuppressionList,
  removeFromSuppressionList,
  isEmailSuppressed,
  listSuppressions,
  bulkAddToSuppressionList,
  type SuppressionReason,
} from '../services/suppression.service.js';
import { logAuditEvent, AuditActions } from '../middleware/audit.js';
import { handleIdempotentRequest, cacheSuccessResponse } from '../lib/idempotency.js';
import { getAppsByAccountId } from '../services/app.service.js';
import { ErrorCodes } from '../lib/error-codes.js';

const SuppressionReasonSchema = z.enum([
  'hard_bounce',
  'soft_bounce',
  'complaint',
  'unsubscribe',
  'manual',
]);

const AddSuppressionSchema = z.object({
  emailAddress: z.string().email(),
  reason: SuppressionReasonSchema,
  expiresAt: z.string().datetime().optional(),
});

const BulkAddSuppressionSchema = z.object({
  entries: z
    .array(
      z.object({
        emailAddress: z.string().email(),
        reason: SuppressionReasonSchema,
      })
    )
    .min(1)
    .max(1000),
});

const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
  reason: SuppressionReasonSchema.optional(),
});

const EmailParamsSchema = z.object({
  email: z.string().email(),
});

export const suppressionRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // List suppressed emails
  app.get('/suppression', { preHandler: requireAuth }, async (request, reply) => {
    const accountId = request.accountId;
    let appId: string | undefined = request.appId;

    // SaaS user without appId - use their first app
    if (accountId && !appId) {
      const accountApps = await getAppsByAccountId(accountId);
      if (accountApps.length > 0) {
        appId = accountApps[0]?.id;
      }
    }

    if (!appId && !request.isAdmin && !accountId) {
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

    const { limit, cursor, reason } = queryResult.data;

    const result = await listSuppressions({
      appId: appId, // undefined for system admin (all), string for app/SaaS user
      limit,
      cursor,
      reason,
    });

    return {
      success: true,
      data: result.entries,
      cursor: result.cursor,
      hasMore: result.hasMore,
    };
  });

  // Check if email is suppressed
  app.get('/suppression/:email', { preHandler: requireAuth }, async (request, reply) => {
    const accountId = request.accountId;
    let appId: string | undefined = request.appId;

    // SaaS user without appId - use their first app
    if (accountId && !appId) {
      const accountApps = await getAppsByAccountId(accountId);
      if (accountApps.length > 0) {
        appId = accountApps[0]?.id;
      }
    }

    if (!appId && !request.isAdmin && !accountId) {
      return reply.status(401).send({
        success: false,
        error: {
          code: ErrorCodes.UNAUTHORIZED,
          message: 'App authentication required',
        },
      });
    }

    const paramsResult = EmailParamsSchema.safeParse(request.params);

    if (!paramsResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: 'Invalid email address',
          details: paramsResult.error.issues,
        },
      });
    }

    // Check specific app or global (if system admin, check global only via '')
    const result = await isEmailSuppressed(appId ?? '', paramsResult.data.email);

    return {
      success: true,
      data: {
        emailAddress: paramsResult.data.email,
        ...result,
      },
    };
  });

  // Add email to suppression list
  app.post('/suppression', { preHandler: requireAuth }, async (request, reply) => {
    const accountId = request.accountId;
    let appId: string | null = request.appId ?? null;

    // SaaS user without appId - use their first app
    if (accountId && !appId) {
      const accountApps = await getAppsByAccountId(accountId);
      if (accountApps.length > 0) {
        appId = accountApps[0]?.id ?? null;
      }
    }

    if (!appId && !request.isAdmin && !accountId) {
      return reply.status(401).send({
        success: false,
        error: {
          code: ErrorCodes.UNAUTHORIZED,
          message: 'App authentication required',
        },
      });
    }

    // Check for idempotent replay
    const replayed = await handleIdempotentRequest(request, reply, 'POST:/suppression');
    if (replayed) return;

    const bodyResult = AddSuppressionSchema.safeParse(request.body);

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

    const { emailAddress, reason, expiresAt } = bodyResult.data;

    const entry = await addToSuppressionList({
      appId: appId, // null for system admin (global), string for app/SaaS user
      emailAddress,
      reason,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    });

    const responseBody = {
      success: true,
      data: entry,
    };

    // Cache response for idempotency
    await cacheSuccessResponse(request, 201, responseBody, 'POST:/suppression');

    return reply.status(201).send(responseBody);
  });

  // Bulk add emails to suppression list
  app.post('/suppression/bulk', { preHandler: requireAuth }, async (request, reply) => {
    const accountId = request.accountId;
    let appId: string | null = request.appId ?? null;

    // SaaS user without appId - use their first app
    if (accountId && !appId) {
      const accountApps = await getAppsByAccountId(accountId);
      if (accountApps.length > 0) {
        appId = accountApps[0]?.id ?? null;
      }
    }

    if (!appId && !request.isAdmin && !accountId) {
      return reply.status(401).send({
        success: false,
        error: {
          code: ErrorCodes.UNAUTHORIZED,
          message: 'App authentication required',
        },
      });
    }

    const bodyResult = BulkAddSuppressionSchema.safeParse(request.body);

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

    const result = await bulkAddToSuppressionList(
      appId, // null for admin (global), string for app/SaaS user
      bodyResult.data.entries
    );

    return reply.status(201).send({
      success: true,
      data: result,
    });
  });

  // Remove email from suppression list
  app.delete('/suppression/:email', { preHandler: requireAuth }, async (request, reply) => {
    const accountId = request.accountId;
    let appId: string | null = request.appId ?? null;

    // SaaS user without appId - use their first app
    if (accountId && !appId) {
      const accountApps = await getAppsByAccountId(accountId);
      if (accountApps.length > 0) {
        appId = accountApps[0]?.id ?? null;
      }
    }

    if (!appId && !request.isAdmin && !accountId) {
      return reply.status(401).send({
        success: false,
        error: {
          code: ErrorCodes.UNAUTHORIZED,
          message: 'App authentication required',
        },
      });
    }

    const paramsResult = EmailParamsSchema.safeParse(request.params);

    if (!paramsResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: 'Invalid email address',
          details: paramsResult.error.issues,
        },
      });
    }

    const removed = await removeFromSuppressionList(
      appId, // null for admin (global), string for app/SaaS user
      paramsResult.data.email
    );

    if (!removed) {
      return reply.status(404).send({
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: 'Email not found in suppression list',
        },
      });
    }

    return reply.status(204).send();
  });

  // Export suppression list
  // Returns JSON by default, or CSV with ?format=csv
  app.get('/suppression/export', { preHandler: requireAuth }, async (request, reply) => {
    const accountId = request.accountId;
    let appId: string | undefined = request.appId;

    // SaaS user without appId - use their first app
    if (accountId && !appId) {
      const accountApps = await getAppsByAccountId(accountId);
      if (accountApps.length > 0) {
        appId = accountApps[0]?.id;
      }
    }

    if (!appId && !request.isAdmin && !accountId) {
      return reply.status(401).send({
        success: false,
        error: {
          code: ErrorCodes.UNAUTHORIZED,
          message: 'App authentication required',
        },
      });
    }

    const query = request.query as { format?: string };
    const format = query.format?.toLowerCase() === 'csv' ? 'csv' : 'json';

    // Get all suppression entries (using cursor pagination for export)
    let allEntries: Array<{
      id: string;
      appId: string | null;
      emailAddress: string;
      reason: SuppressionReason;
      sourceEmailId: string | null;
      expiresAt: Date | null;
      createdAt: Date;
    }> = [];
    let cursor: string | undefined;
    const batchSize = 1000;

    while (true) {
      const result = await listSuppressions({
        appId: appId, // undefined for admin (all), string for app/SaaS user
        limit: batchSize,
        cursor,
      });
      allEntries = allEntries.concat(result.entries);
      if (!result.hasMore || !result.cursor) break;
      cursor = result.cursor;
    }

    // Log audit event
    await logAuditEvent(request, AuditActions.SUPPRESSION_EXPORT, 'suppression_list', undefined, {
      after: { entriesExported: allEntries.length, format },
    });

    // Return CSV format if requested
    if (format === 'csv') {
      const csvHeader = 'email_address,reason,expires_at,created_at';
      const csvRows = allEntries.map((entry) => {
        const expiresAt = entry.expiresAt ? entry.expiresAt.toISOString() : '';
        const createdAt = entry.createdAt.toISOString();
        return `${entry.emailAddress},${entry.reason},${expiresAt},${createdAt}`;
      });
      const csv = [csvHeader, ...csvRows].join('\n');

      reply.header('Content-Type', 'text/csv');
      reply.header(
        'Content-Disposition',
        `attachment; filename="suppression_list_${new Date().toISOString().split('T')[0]}.csv"`
      );
      return csv;
    }

    // Return JSON format (default)
    return {
      success: true,
      data: {
        entries: allEntries.map((entry) => ({
          emailAddress: entry.emailAddress,
          reason: entry.reason,
          expiresAt: entry.expiresAt?.toISOString() ?? null,
          createdAt: entry.createdAt.toISOString(),
        })),
        totalCount: allEntries.length,
        exportedAt: new Date().toISOString(),
      },
    };
  });

  // Import suppression list from CSV
  app.post('/suppression/import', { preHandler: requireAuth }, async (request, reply) => {
    const accountId = request.accountId;
    let appId: string | null = request.appId ?? null;

    // SaaS user without appId - use their first app
    if (accountId && !appId) {
      const accountApps = await getAppsByAccountId(accountId);
      if (accountApps.length > 0) {
        appId = accountApps[0]?.id ?? null;
      }
    }

    if (!appId && !request.isAdmin && !accountId) {
      return reply.status(401).send({
        success: false,
        error: {
          code: ErrorCodes.UNAUTHORIZED,
          message: 'App authentication required',
        },
      });
    }

    const body = request.body as { csv?: string };

    if (!body.csv || typeof body.csv !== 'string') {
      return reply.status(400).send({
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: 'CSV data is required in the "csv" field',
        },
      });
    }

    const lines = body.csv.trim().split('\n');
    if (lines.length < 2) {
      return reply.status(400).send({
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: 'CSV must have a header row and at least one data row',
        },
      });
    }

    // Parse header to determine column order
    const header =
      lines[0]
        ?.toLowerCase()
        .split(',')
        .map((h) => h.trim()) ?? [];
    const emailIndex = header.indexOf('email_address');
    const reasonIndex = header.indexOf('reason');

    if (emailIndex === -1) {
      return reply.status(400).send({
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: 'CSV must have an "email_address" column',
        },
      });
    }

    // Parse data rows
    const entries: Array<{ emailAddress: string; reason: SuppressionReason }> = [];
    const errors: Array<{ line: number; error: string }> = [];
    const validReasons: SuppressionReason[] = [
      'hard_bounce',
      'soft_bounce',
      'complaint',
      'unsubscribe',
      'manual',
    ];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line?.trim()) continue;

      const cols = line.split(',').map((c) => c.trim());
      const email = cols[emailIndex];
      const reason = (reasonIndex !== -1 ? cols[reasonIndex] : 'manual') as SuppressionReason;

      if (!email) {
        errors.push({ line: i + 1, error: 'Missing email address' });
        continue;
      }

      // Basic email validation
      if (!email.includes('@')) {
        errors.push({ line: i + 1, error: `Invalid email: ${email}` });
        continue;
      }

      if (!validReasons.includes(reason)) {
        errors.push({ line: i + 1, error: `Invalid reason: ${reason}` });
        continue;
      }

      entries.push({ emailAddress: email, reason });
    }

    if (entries.length === 0) {
      return reply.status(400).send({
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: 'No valid entries found in CSV',
          details: errors,
        },
      });
    }

    // Import in batches
    const batchSize = 1000;
    let totalAdded = 0;
    let totalSkipped = 0;

    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize);
      const result = await bulkAddToSuppressionList(
        appId, // null for admin (global), string for app/SaaS user
        batch
      );
      totalAdded += result.added;
      totalSkipped += result.skipped;
    }

    // Log audit event
    await logAuditEvent(request, AuditActions.SUPPRESSION_IMPORT, 'suppression_list', undefined, {
      after: { entriesImported: totalAdded, entriesSkipped: totalSkipped, errors: errors.length },
    });

    return reply.status(201).send({
      success: true,
      data: {
        imported: totalAdded,
        skipped: totalSkipped,
        errors: errors.length > 0 ? errors.slice(0, 100) : undefined, // Limit errors in response
        totalErrors: errors.length,
      },
    });
  });
};
