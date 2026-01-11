import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  getTeamMembers,
  getPendingInvitations,
  createInvitation,
  acceptInvitation,
  cancelInvitation,
  updateMemberRole,
  removeMember,
  getInvitationByToken,
} from '../services/team.service.js';
import { requireSaaSAuth, requireAccountAdmin } from '../middleware/saas-auth.js';

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'editor', 'viewer']),
});

const updateRoleSchema = z.object({
  role: z.enum(['admin', 'editor', 'viewer']),
});

const acceptInviteSchema = z.object({
  token: z.string(),
});

export const teamRoutes: FastifyPluginAsync = async (fastify) => {
  // Get team members (requires auth)
  fastify.get('/', { preHandler: requireSaaSAuth }, async (request, reply) => {
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

    const members = await getTeamMembers(accountId);

    return {
      success: true,
      data: members,
    };
  });

  // Get pending invitations (requires admin)
  fastify.get(
    '/invitations',
    { preHandler: [requireSaaSAuth, requireAccountAdmin] },
    async (request, _reply) => {
      const accountId = request.accountId as string;

      const invitations = await getPendingInvitations(accountId);

      return {
        success: true,
        data: invitations,
      };
    }
  );

  // Create invitation (requires admin)
  fastify.post(
    '/invite',
    { preHandler: [requireSaaSAuth, requireAccountAdmin] },
    async (request, reply) => {
      const body = inviteSchema.safeParse(request.body);
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
      const invitedBy = request.saasUserId as string;

      try {
        const invitation = await createInvitation({
          accountId,
          email: body.data.email,
          role: body.data.role,
          invitedBy,
        });

        // TODO: Send invitation email
        // await sendInvitationEmail(invitation.email, invitation.token);

        return reply.status(201).send({
          success: true,
          data: invitation,
        });
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === 'TEAM_LIMIT_EXCEEDED') {
            return reply.status(403).send({
              success: false,
              error: {
                code: 'TEAM_LIMIT_EXCEEDED',
                message: 'Team member limit reached. Upgrade your plan to invite more members.',
              },
            });
          }
          if (error.message === 'ALREADY_MEMBER') {
            return reply.status(409).send({
              success: false,
              error: {
                code: 'ALREADY_MEMBER',
                message: 'This user is already a team member',
              },
            });
          }
        }
        throw error;
      }
    }
  );

  // Get invitation by token (public - for accept page)
  fastify.get('/invite/:token', async (request, reply) => {
    const { token } = request.params as { token: string };

    const invitation = await getInvitationByToken(token);

    if (!invitation) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'INVITATION_NOT_FOUND',
          message: 'Invitation not found',
        },
      });
    }

    return {
      success: true,
      data: invitation,
    };
  });

  // Accept invitation (requires auth)
  fastify.post('/accept', { preHandler: requireSaaSAuth }, async (request, reply) => {
    const body = acceptInviteSchema.safeParse(request.body);
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

    const userId = request.saasUserId as string;

    try {
      const membership = await acceptInvitation(body.data.token, userId);

      if (!membership) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'INVITATION_NOT_FOUND',
            message: 'Invitation not found or invalid',
          },
        });
      }

      return {
        success: true,
        data: membership,
      };
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'INVITATION_EXPIRED') {
          return reply.status(410).send({
            success: false,
            error: {
              code: 'INVITATION_EXPIRED',
              message: 'This invitation has expired',
            },
          });
        }
        if (error.message === 'EMAIL_MISMATCH') {
          return reply.status(403).send({
            success: false,
            error: {
              code: 'EMAIL_MISMATCH',
              message: 'This invitation was sent to a different email address',
            },
          });
        }
      }
      throw error;
    }
  });

  // Cancel invitation (requires admin)
  fastify.delete(
    '/invite/:invitationId',
    { preHandler: [requireSaaSAuth, requireAccountAdmin] },
    async (request, reply) => {
      const { invitationId } = request.params as { invitationId: string };
      const accountId = request.accountId as string;

      const deleted = await cancelInvitation(invitationId, accountId);

      if (!deleted) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'INVITATION_NOT_FOUND',
            message: 'Invitation not found',
          },
        });
      }

      return {
        success: true,
        data: { deleted: true },
      };
    }
  );

  // Update member role (requires admin)
  fastify.patch(
    '/:membershipId',
    { preHandler: [requireSaaSAuth, requireAccountAdmin] },
    async (request, reply) => {
      const { membershipId } = request.params as { membershipId: string };
      const body = updateRoleSchema.safeParse(request.body);

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

      const updated = await updateMemberRole(membershipId, accountId, body.data.role);

      if (!updated) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'MEMBER_NOT_FOUND',
            message: 'Team member not found',
          },
        });
      }

      return {
        success: true,
        data: updated,
      };
    }
  );

  // Remove member (requires admin)
  fastify.delete(
    '/:membershipId',
    { preHandler: [requireSaaSAuth, requireAccountAdmin] },
    async (request, reply) => {
      const { membershipId } = request.params as { membershipId: string };
      const accountId = request.accountId as string;

      const removed = await removeMember(membershipId, accountId);

      if (!removed) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'MEMBER_NOT_FOUND',
            message: 'Team member not found',
          },
        });
      }

      return {
        success: true,
        data: { removed: true },
      };
    }
  );
};
