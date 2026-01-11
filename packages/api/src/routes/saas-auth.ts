import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import {
  createSaasUser,
  validateSaasCredentials,
  handleOAuthUser,
  verifyEmail,
  requestPasswordReset,
  resetPassword,
  getSaasUserById,
} from '../services/saas-user.service.js';
import { config } from '../config.js';

// Generate JWT token for SaaS user
function generateSaaSToken(userId: string, email: string, accountId?: string, accountRole?: string): string {
  return jwt.sign(
    {
      sub: userId,
      email,
      accountId,
      accountRole,
    },
    config.jwtSecret,
    { expiresIn: '30d' }
  );
}

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const oauthGoogleSchema = z.object({
  googleId: z.string(),
  email: z.string().email(),
  name: z.string(),
  image: z.string().optional(),
});

const verifyEmailSchema = z.object({
  token: z.string(),
});

const requestResetSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string(),
  password: z.string().min(8),
});

export const saasAuthRoutes: FastifyPluginAsync = async (fastify) => {
  // Register new user
  fastify.post('/register', async (request, reply) => {
    const body = registerSchema.safeParse(request.body);
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

    try {
      const result = await createSaasUser(body.data);

      // Generate JWT token for API authentication
      const token = generateSaaSToken(
        result.user.id,
        result.user.email,
        result.account?.id,
        result.account?.role
      );

      // TODO: Send verification email
      // await sendVerificationEmail(result.user.email, verificationToken);

      return reply.status(201).send({
        success: true,
        data: {
          ...result,
          token,
        },
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'EMAIL_EXISTS') {
        return reply.status(409).send({
          success: false,
          error: {
            code: 'EMAIL_EXISTS',
            message: 'An account with this email already exists',
          },
        });
      }
      throw error;
    }
  });

  // Login
  fastify.post('/login', async (request, reply) => {
    const body = loginSchema.safeParse(request.body);
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

    try {
      const result = await validateSaasCredentials(body.data.email, body.data.password);

      if (!result) {
        return reply.status(401).send({
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password',
          },
        });
      }

      // Generate JWT token for API authentication
      const token = generateSaaSToken(
        result.user.id,
        result.user.email,
        result.account?.id,
        result.account?.role
      );

      return {
        success: true,
        data: {
          ...result,
          token,
        },
      };
    } catch (error) {
      if (error instanceof Error && error.message === 'ACCOUNT_DISABLED') {
        return reply.status(403).send({
          success: false,
          error: {
            code: 'ACCOUNT_DISABLED',
            message: 'Your account has been disabled',
          },
        });
      }
      throw error;
    }
  });

  // Handle Google OAuth callback
  fastify.post('/oauth/google', async (request, reply) => {
    const body = oauthGoogleSchema.safeParse(request.body);
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

    try {
      const result = await handleOAuthUser({
        provider: 'google',
        providerId: body.data.googleId,
        email: body.data.email,
        name: body.data.name,
        image: body.data.image,
      });

      // Generate JWT token for API authentication
      const token = generateSaaSToken(
        result.user.id,
        result.user.email,
        result.account?.id,
        result.account?.role
      );

      return {
        success: true,
        data: {
          ...result,
          token,
        },
      };
    } catch (error) {
      fastify.log.error(error, 'OAuth error');
      return reply.status(500).send({
        success: false,
        error: {
          code: 'OAUTH_ERROR',
          message: 'Failed to authenticate with Google',
        },
      });
    }
  });

  // Verify email
  fastify.post('/email/verify', async (request, reply) => {
    const body = verifyEmailSchema.safeParse(request.body);
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

    const verified = await verifyEmail(body.data.token);

    if (!verified) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid or expired verification token',
        },
      });
    }

    return {
      success: true,
      data: { verified: true },
    };
  });

  // Request password reset
  fastify.post('/password/reset/request', async (request, reply) => {
    const body = requestResetSchema.safeParse(request.body);
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

    const _token = await requestPasswordReset(body.data.email);

    // TODO: Send password reset email if token was generated
    // if (token) {
    //   await sendPasswordResetEmail(body.data.email, token);
    // }

    // Always return success to prevent email enumeration
    return {
      success: true,
      data: {
        message: 'If an account with this email exists, a password reset link has been sent',
      },
    };
  });

  // Reset password
  fastify.post('/password/reset', async (request, reply) => {
    const body = resetPasswordSchema.safeParse(request.body);
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

    const reset = await resetPassword(body.data.token, body.data.password);

    if (!reset) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid or expired reset token',
        },
      });
    }

    return {
      success: true,
      data: { reset: true },
    };
  });

  // Get current user (for NextAuth session refresh)
  fastify.get('/me', async (request, reply) => {
    // This endpoint is called by NextAuth to refresh session data
    // The user ID should be passed via a header or query param
    const userId = request.headers['x-user-id'] as string;

    if (!userId) {
      return reply.status(401).send({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'User ID required',
        },
      });
    }

    const result = await getSaasUserById(userId);

    if (!result) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
        },
      });
    }

    return {
      success: true,
      data: result,
    };
  });
};
