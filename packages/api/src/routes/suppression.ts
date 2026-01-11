import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireScope } from '../middleware/auth.js';
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
  app.get(
    '/suppression',
    { preHandler: requireScope('suppression:manage') },
    async (request, reply) => {
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

      const { limit, cursor, reason } = queryResult.data;

      const result = await listSuppressions({
        appId: request.appId,
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
    }
  );

  // Check if email is suppressed
  app.get(
    '/suppression/:email',
    { preHandler: requireScope('suppression:manage') },
    async (request, reply) => {
      if (!request.appId) {
        return reply.status(401).send({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'App authentication required',
          },
        });
      }

      const paramsResult = EmailParamsSchema.safeParse(request.params);

      if (!paramsResult.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid email address',
            details: paramsResult.error.issues,
          },
        });
      }

      const result = await isEmailSuppressed(request.appId, paramsResult.data.email);

      return {
        success: true,
        data: {
          emailAddress: paramsResult.data.email,
          ...result,
        },
      };
    }
  );

  // Add email to suppression list
  app.post(
    '/suppression',
    { preHandler: requireScope('suppression:manage') },
    async (request, reply) => {
      if (!request.appId) {
        return reply.status(401).send({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
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
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: bodyResult.error.issues,
          },
        });
      }

      const { emailAddress, reason, expiresAt } = bodyResult.data;

      const entry = await addToSuppressionList({
        appId: request.appId,
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
    }
  );

  // Bulk add emails to suppression list
  app.post(
    '/suppression/bulk',
    { preHandler: requireScope('suppression:manage') },
    async (request, reply) => {
      if (!request.appId) {
        return reply.status(401).send({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'App authentication required',
          },
        });
      }

      const bodyResult = BulkAddSuppressionSchema.safeParse(request.body);

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

      const result = await bulkAddToSuppressionList(request.appId, bodyResult.data.entries);

      return reply.status(201).send({
        success: true,
        data: result,
      });
    }
  );

  // Remove email from suppression list
  app.delete(
    '/suppression/:email',
    { preHandler: requireScope('suppression:manage') },
    async (request, reply) => {
      if (!request.appId) {
        return reply.status(401).send({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'App authentication required',
          },
        });
      }

      const paramsResult = EmailParamsSchema.safeParse(request.params);

      if (!paramsResult.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid email address',
            details: paramsResult.error.issues,
          },
        });
      }

      const removed = await removeFromSuppressionList(request.appId, paramsResult.data.email);

      if (!removed) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Email not found in suppression list',
          },
        });
      }

      return reply.status(204).send();
    }
  );

  // Export suppression list as CSV
  app.get(
    '/suppression/export',
    { preHandler: requireScope('suppression:manage') },
    async (request, reply) => {
      if (!request.appId) {
        return reply.status(401).send({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'App authentication required',
          },
        });
      }

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
          appId: request.appId,
          limit: batchSize,
          cursor,
        });
        allEntries = allEntries.concat(result.entries);
        if (!result.hasMore || !result.cursor) break;
        cursor = result.cursor;
      }

      // Generate CSV
      const csvHeader = 'email_address,reason,expires_at,created_at';
      const csvRows = allEntries.map((entry) => {
        const expiresAt = entry.expiresAt ? entry.expiresAt.toISOString() : '';
        const createdAt = entry.createdAt.toISOString();
        return `${entry.emailAddress},${entry.reason},${expiresAt},${createdAt}`;
      });
      const csv = [csvHeader, ...csvRows].join('\n');

      // Log audit event
      await logAuditEvent(request, AuditActions.SUPPRESSION_EXPORT, 'suppression_list', undefined, {
        after: { entriesExported: allEntries.length },
      });

      reply.header('Content-Type', 'text/csv');
      reply.header(
        'Content-Disposition',
        `attachment; filename="suppression_list_${new Date().toISOString().split('T')[0]}.csv"`
      );
      return csv;
    }
  );

  // Import suppression list from CSV
  app.post(
    '/suppression/import',
    { preHandler: requireScope('suppression:manage') },
    async (request, reply) => {
      if (!request.appId) {
        return reply.status(401).send({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'App authentication required',
          },
        });
      }

      const body = request.body as { csv?: string };

      if (!body.csv || typeof body.csv !== 'string') {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'CSV data is required in the "csv" field',
          },
        });
      }

      const lines = body.csv.trim().split('\n');
      if (lines.length < 2) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
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
            code: 'VALIDATION_ERROR',
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
            code: 'VALIDATION_ERROR',
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
        const result = await bulkAddToSuppressionList(request.appId, batch);
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
    }
  );
};
