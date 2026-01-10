import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireScope } from '../middleware/auth.js';
import {
  addToSuppressionList,
  removeFromSuppressionList,
  isEmailSuppressed,
  listSuppressions,
  bulkAddToSuppressionList,
} from '../services/suppression.service.js';

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
  offset: z.coerce.number().int().min(0).default(0),
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

      const { limit, offset, reason } = queryResult.data;

      const { entries, total } = await listSuppressions({
        appId: request.appId,
        limit,
        offset,
        reason,
      });

      return {
        success: true,
        data: entries,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + entries.length < total,
        },
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

      return reply.status(201).send({
        success: true,
        data: entry,
      });
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
};
