import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  getWebhookDeliveries,
  getWebhookDeliveryById,
  retryWebhookDelivery,
} from '../services/webhook.service.js';
import { requireScope } from '../middleware/auth.js';

const ParamsSchema = z.object({
  id: z.string().uuid(),
});

const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(['pending', 'delivered', 'failed']).optional(),
  emailId: z.string().uuid().optional(),
});

export const webhooksRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // List webhook deliveries
  app.get(
    '/webhooks/deliveries',
    { preHandler: requireScope('analytics:read') },
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

      const { limit, offset, status, emailId } = queryResult.data;

      const result = await getWebhookDeliveries({
        appId: request.appId,
        status,
        emailId,
        limit,
        offset,
      });

      return reply.send({
        success: true,
        data: result.deliveries,
        pagination: {
          total: result.total,
          limit,
          offset,
          hasMore: offset + result.deliveries.length < result.total,
        },
      });
    }
  );

  // Get webhook delivery by ID
  app.get(
    '/webhooks/deliveries/:id',
    { preHandler: requireScope('analytics:read') },
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
            message: 'Invalid delivery ID',
            details: paramsResult.error.issues,
          },
        });
      }

      const delivery = await getWebhookDeliveryById(paramsResult.data.id, request.appId);

      if (!delivery) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Webhook delivery not found',
          },
        });
      }

      return reply.send({
        success: true,
        data: delivery,
      });
    }
  );

  // Retry failed webhook delivery
  app.post(
    '/webhooks/deliveries/:id/retry',
    { preHandler: requireScope('admin') },
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
            message: 'Invalid delivery ID',
            details: paramsResult.error.issues,
          },
        });
      }

      const result = await retryWebhookDelivery(paramsResult.data.id, request.appId);

      if (!result.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'RETRY_FAILED',
            message: result.message,
          },
        });
      }

      return reply.send({
        success: true,
        message: result.message,
      });
    }
  );
};
