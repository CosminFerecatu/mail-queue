import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { isMailQueueError } from '@mail-queue/core';
import { requireScope } from '../middleware/auth.js';
import {
  createScheduledJob,
  getScheduledJobById,
  listScheduledJobs,
  updateScheduledJob,
  deleteScheduledJob,
  validateCronExpression,
} from '../services/scheduled-jobs.service.js';

const EmailTemplateSchema = z
  .object({
    from: z.object({
      email: z.string().email(),
      name: z.string().max(100).optional(),
    }),
    subject: z.string().min(1).max(998),
    html: z.string().max(5_000_000).optional(),
    text: z.string().max(1_000_000).optional(),
    headers: z.record(z.string()).optional(),
  })
  .refine((data) => data.html || data.text, {
    message: 'Either html or text body is required',
  });

const CreateScheduledJobSchema = z.object({
  queueName: z.string().min(1).max(100),
  name: z.string().min(1).max(255),
  cronExpression: z.string().min(1).max(100),
  timezone: z.string().max(50).optional(),
  emailTemplate: EmailTemplateSchema,
});

const UpdateScheduledJobSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  cronExpression: z.string().min(1).max(100).optional(),
  timezone: z.string().max(50).optional(),
  emailTemplate: EmailTemplateSchema.optional(),
  isActive: z.boolean().optional(),
});

const ParamsSchema = z.object({
  id: z.string().uuid(),
});

const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .optional(),
});

export const scheduledJobsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // List scheduled jobs
  app.get(
    '/scheduled-jobs',
    { preHandler: requireScope('queue:manage') },
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

      const { limit, cursor, isActive } = queryResult.data;

      const result = await listScheduledJobs(request.appId, {
        limit,
        cursor,
        isActive,
      });

      return {
        success: true,
        data: result.jobs,
        cursor: result.cursor,
        hasMore: result.hasMore,
      };
    }
  );

  // Get scheduled job by ID
  app.get(
    '/scheduled-jobs/:id',
    { preHandler: requireScope('queue:manage') },
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

      const paramsResult = ParamsSchema.safeParse(request.params);

      if (!paramsResult.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid job ID',
            details: paramsResult.error.issues,
          },
        });
      }

      const job = await getScheduledJobById(paramsResult.data.id, request.appId);

      if (!job) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Scheduled job not found',
          },
        });
      }

      return {
        success: true,
        data: job,
      };
    }
  );

  // Create scheduled job
  app.post(
    '/scheduled-jobs',
    { preHandler: requireScope('queue:manage') },
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

      const bodyResult = CreateScheduledJobSchema.safeParse(request.body);

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

      // Additional validation for cron expression
      if (
        !validateCronExpression(bodyResult.data.cronExpression, bodyResult.data.timezone ?? 'UTC')
      ) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid cron expression',
            details: [{ path: 'cronExpression', message: 'Invalid cron expression format' }],
          },
        });
      }

      try {
        const job = await createScheduledJob(request.appId, bodyResult.data);

        return reply.status(201).send({
          success: true,
          data: job,
        });
      } catch (error) {
        if (isMailQueueError(error)) {
          return reply.status(error.statusCode).send({
            success: false,
            error: error.toJSON(),
          });
        }
        throw error;
      }
    }
  );

  // Update scheduled job
  app.patch(
    '/scheduled-jobs/:id',
    { preHandler: requireScope('queue:manage') },
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

      const paramsResult = ParamsSchema.safeParse(request.params);

      if (!paramsResult.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid job ID',
            details: paramsResult.error.issues,
          },
        });
      }

      const bodyResult = UpdateScheduledJobSchema.safeParse(request.body);

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

      try {
        const job = await updateScheduledJob(paramsResult.data.id, request.appId, bodyResult.data);

        if (!job) {
          return reply.status(404).send({
            success: false,
            error: {
              code: 'NOT_FOUND',
              message: 'Scheduled job not found',
            },
          });
        }

        return {
          success: true,
          data: job,
        };
      } catch (error) {
        if (isMailQueueError(error)) {
          return reply.status(error.statusCode).send({
            success: false,
            error: error.toJSON(),
          });
        }
        throw error;
      }
    }
  );

  // Delete scheduled job
  app.delete(
    '/scheduled-jobs/:id',
    { preHandler: requireScope('queue:manage') },
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

      const paramsResult = ParamsSchema.safeParse(request.params);

      if (!paramsResult.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid job ID',
            details: paramsResult.error.issues,
          },
        });
      }

      const deleted = await deleteScheduledJob(paramsResult.data.id, request.appId);

      if (!deleted) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Scheduled job not found',
          },
        });
      }

      return reply.status(204).send();
    }
  );

  // Validate cron expression endpoint
  app.get(
    '/scheduled-jobs/validate-cron',
    { preHandler: requireScope('queue:manage') },
    async (request, reply) => {
      const schema = z.object({
        cronExpression: z.string().min(1),
        timezone: z.string().optional(),
      });

      const queryResult = schema.safeParse(request.query);

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

      const isValid = validateCronExpression(
        queryResult.data.cronExpression,
        queryResult.data.timezone ?? 'UTC'
      );

      return {
        success: true,
        data: {
          valid: isValid,
          cronExpression: queryResult.data.cronExpression,
          timezone: queryResult.data.timezone ?? 'UTC',
        },
      };
    }
  );
};
