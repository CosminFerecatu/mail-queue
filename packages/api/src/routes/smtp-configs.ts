import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { CreateSmtpConfigSchema, UpdateSmtpConfigSchema } from '@mail-queue/core';
import {
  createSmtpConfig,
  getSmtpConfigById,
  getSmtpConfigsByAppId,
  updateSmtpConfig,
  deleteSmtpConfig,
  setSmtpConfigActive,
  testSmtpConfig,
  formatSmtpConfigResponse,
} from '../services/smtp.service.js';
import { requireScope } from '../middleware/auth.js';

const ParamsSchema = z.object({
  id: z.string().uuid(),
});

const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function smtpConfigRoutes(app: FastifyInstance): Promise<void> {
  // All SMTP config routes require smtp:manage scope
  app.addHook('preHandler', requireScope('smtp:manage'));

  // Create SMTP config
  app.post(
    '/smtp-configs',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof CreateSmtpConfigSchema> }>,
      reply: FastifyReply
    ) => {
      if (!request.appId) {
        return reply.status(401).send({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'App authentication required',
          },
        });
      }

      const result = CreateSmtpConfigSchema.safeParse(request.body);

      if (!result.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: result.error.issues,
          },
        });
      }

      const smtpConfig = await createSmtpConfig(request.appId, result.data);

      return reply.status(201).send({
        success: true,
        data: formatSmtpConfigResponse(smtpConfig),
      });
    }
  );

  // List SMTP configs
  app.get(
    '/smtp-configs',
    async (
      request: FastifyRequest<{ Querystring: z.infer<typeof ListQuerySchema> }>,
      reply: FastifyReply
    ) => {
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

      const { limit, offset } = queryResult.data;

      const { configs, total } = await getSmtpConfigsByAppId(request.appId, { limit, offset });

      return {
        success: true,
        data: configs.map(formatSmtpConfigResponse),
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + configs.length < total,
        },
      };
    }
  );

  // Get SMTP config by ID
  app.get(
    '/smtp-configs/:id',
    async (
      request: FastifyRequest<{ Params: z.infer<typeof ParamsSchema> }>,
      reply: FastifyReply
    ) => {
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
            message: 'Invalid SMTP config ID',
            details: paramsResult.error.issues,
          },
        });
      }

      const smtpConfig = await getSmtpConfigById(paramsResult.data.id, request.appId);

      if (!smtpConfig) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'SMTP configuration not found',
          },
        });
      }

      return {
        success: true,
        data: formatSmtpConfigResponse(smtpConfig),
      };
    }
  );

  // Update SMTP config
  app.patch(
    '/smtp-configs/:id',
    async (
      request: FastifyRequest<{
        Params: z.infer<typeof ParamsSchema>;
        Body: z.infer<typeof UpdateSmtpConfigSchema>;
      }>,
      reply: FastifyReply
    ) => {
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
            message: 'Invalid SMTP config ID',
            details: paramsResult.error.issues,
          },
        });
      }

      const bodyResult = UpdateSmtpConfigSchema.safeParse(request.body);

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

      const smtpConfig = await updateSmtpConfig(
        paramsResult.data.id,
        request.appId,
        bodyResult.data
      );

      if (!smtpConfig) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'SMTP configuration not found',
          },
        });
      }

      return {
        success: true,
        data: formatSmtpConfigResponse(smtpConfig),
      };
    }
  );

  // Delete SMTP config
  app.delete(
    '/smtp-configs/:id',
    async (
      request: FastifyRequest<{ Params: z.infer<typeof ParamsSchema> }>,
      reply: FastifyReply
    ) => {
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
            message: 'Invalid SMTP config ID',
            details: paramsResult.error.issues,
          },
        });
      }

      const deleted = await deleteSmtpConfig(paramsResult.data.id, request.appId);

      if (!deleted) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'SMTP configuration not found',
          },
        });
      }

      return reply.status(204).send();
    }
  );

  // Activate SMTP config
  app.post(
    '/smtp-configs/:id/activate',
    async (
      request: FastifyRequest<{ Params: z.infer<typeof ParamsSchema> }>,
      reply: FastifyReply
    ) => {
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
            message: 'Invalid SMTP config ID',
            details: paramsResult.error.issues,
          },
        });
      }

      const activated = await setSmtpConfigActive(paramsResult.data.id, request.appId, true);

      if (!activated) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'SMTP configuration not found',
          },
        });
      }

      return {
        success: true,
        message: 'SMTP configuration activated',
      };
    }
  );

  // Deactivate SMTP config
  app.post(
    '/smtp-configs/:id/deactivate',
    async (
      request: FastifyRequest<{ Params: z.infer<typeof ParamsSchema> }>,
      reply: FastifyReply
    ) => {
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
            message: 'Invalid SMTP config ID',
            details: paramsResult.error.issues,
          },
        });
      }

      const deactivated = await setSmtpConfigActive(paramsResult.data.id, request.appId, false);

      if (!deactivated) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'SMTP configuration not found',
          },
        });
      }

      return {
        success: true,
        message: 'SMTP configuration deactivated',
      };
    }
  );

  // Test SMTP config
  app.post(
    '/smtp-configs/:id/test',
    async (
      request: FastifyRequest<{ Params: z.infer<typeof ParamsSchema> }>,
      reply: FastifyReply
    ) => {
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
            message: 'Invalid SMTP config ID',
            details: paramsResult.error.issues,
          },
        });
      }

      const testResult = await testSmtpConfig(paramsResult.data.id, request.appId);

      if (!testResult) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'SMTP configuration not found',
          },
        });
      }

      return {
        success: true,
        data: testResult,
      };
    }
  );
}
