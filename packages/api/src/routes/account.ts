import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  getAccountById,
  updateAccountName,
  canCreateApp,
  canAddTeamMember,
} from '../services/account.service.js';
import { requireSaaSAuth, requireAccountOwner } from '../middleware/saas-auth.js';

const updateAccountSchema = z.object({
  name: z.string().min(2).max(100).optional(),
});

export const accountRoutes: FastifyPluginAsync = async (fastify) => {
  // Apply SaaS auth to all routes
  fastify.addHook('preHandler', requireSaaSAuth);

  // Get current account
  fastify.get('/', async (request, reply) => {
    const accountId = request.accountId;

    if (!accountId) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'NO_ACCOUNT',
          message: 'User does not have an account',
        },
      });
    }

    const account = await getAccountById(accountId);

    if (!account) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'ACCOUNT_NOT_FOUND',
          message: 'Account not found',
        },
      });
    }

    return {
      success: true,
      data: account,
    };
  });

  // Update account (owner only)
  fastify.patch('/', { preHandler: requireAccountOwner }, async (request, reply) => {
    const body = updateAccountSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: body.error.issues,
        },
      });
    }

    const accountId = request.accountId as string;

    if (body.data.name) {
      await updateAccountName(accountId, body.data.name);
    }

    const account = await getAccountById(accountId);

    return {
      success: true,
      data: account,
    };
  });

  // Get account usage/limits
  fastify.get('/usage', async (request, reply) => {
    const accountId = request.accountId;

    if (!accountId) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'NO_ACCOUNT',
          message: 'User does not have an account',
        },
      });
    }

    const [appLimit, teamLimit] = await Promise.all([
      canCreateApp(accountId),
      canAddTeamMember(accountId),
    ]);

    return {
      success: true,
      data: {
        apps: {
          current: appLimit.current,
          max: appLimit.max,
          canCreate: appLimit.allowed,
        },
        teamMembers: {
          current: teamLimit.current,
          max: teamLimit.max,
          canAdd: teamLimit.allowed,
        },
      },
    };
  });
};
