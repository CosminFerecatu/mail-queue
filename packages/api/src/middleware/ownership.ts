import type { FastifyRequest, FastifyReply } from 'fastify';
import { ErrorCodes } from '../lib/error-codes.js';
import { getAppById } from '../services/app.service.js';

/**
 * Resource ownership verification middleware.
 *
 * Consolidates the duplicated verifyAppOwnership patterns found in:
 * - routes/apps.ts
 * - routes/apikeys.ts
 * - routes/analytics.ts
 */

/**
 * Result type for ownership verification that includes the fetched resource.
 */
export interface OwnershipResult<T> {
  /** Whether the user is authorized to access the resource */
  authorized: boolean;
  /** The fetched resource data (null if not found) */
  resource: T | null;
}

/**
 * Verifies that a SaaS user owns the specified app.
 *
 * Authorization rules:
 * - System admins can access any app
 * - SaaS users can only access apps belonging to their account
 * - API key users already have appId set and this should not be called
 *
 * @param request - The Fastify request object
 * @param reply - The Fastify reply object
 * @param appId - The app ID to verify ownership of
 * @returns OwnershipResult with authorization status and app data
 */
export async function verifyAppOwnership(
  request: FastifyRequest,
  reply: FastifyReply,
  appId: string
): Promise<OwnershipResult<Awaited<ReturnType<typeof getAppById>>>> {
  const appData = await getAppById(appId);

  if (!appData) {
    reply.status(404).send({
      success: false,
      error: {
        code: ErrorCodes.NOT_FOUND,
        message: 'App not found',
      },
    });
    return { authorized: false, resource: null };
  }

  // System admin can access any app
  if (request.isAdmin) {
    return { authorized: true, resource: appData };
  }

  // SaaS users must own the app through their account
  const accountId = request.accountId;
  if (accountId) {
    if (appData.accountId !== accountId) {
      reply.status(403).send({
        success: false,
        error: {
          code: ErrorCodes.FORBIDDEN,
          message: 'You do not have access to this app',
        },
      });
      return { authorized: false, resource: appData };
    }
    return { authorized: true, resource: appData };
  }

  // No accountId and not admin - unauthorized
  reply.status(401).send({
    success: false,
    error: {
      code: ErrorCodes.UNAUTHORIZED,
      message: 'Authentication required',
    },
  });
  return { authorized: false, resource: appData };
}

/**
 * Verifies app ownership without fetching app data.
 * Returns a boolean instead of the full OwnershipResult.
 *
 * Use this when you only need to check access and will fetch
 * the app data separately if needed.
 *
 * @param request - The Fastify request object
 * @param reply - The Fastify reply object
 * @param appId - The app ID to verify ownership of
 * @returns true if authorized, false if response was sent
 */
export async function verifyAppAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  appId: string
): Promise<boolean> {
  // Admin can access any app
  if (request.isAdmin) return true;

  // SaaS users must own the app through their account
  const accountId = request.accountId;
  if (!accountId) {
    reply.status(401).send({
      success: false,
      error: {
        code: ErrorCodes.UNAUTHORIZED,
        message: 'Authentication required',
      },
    });
    return false;
  }

  const app = await getAppById(appId);
  if (!app || app.accountId !== accountId) {
    reply.status(403).send({
      success: false,
      error: {
        code: ErrorCodes.FORBIDDEN,
        message: 'You do not have access to this app',
      },
    });
    return false;
  }

  return true;
}

/**
 * Generic resource ownership verification.
 *
 * This is a more flexible version that can verify ownership of any resource
 * by checking if the resource's accountId matches the user's accountId.
 *
 * @param request - The Fastify request object
 * @param reply - The Fastify reply object
 * @param resource - The resource to verify ownership of (must have accountId property)
 * @param resourceName - Name of the resource for error messages
 * @returns true if authorized, false if response was sent
 */
export async function verifyResourceOwnership<T extends { accountId?: string | null }>(
  request: FastifyRequest,
  reply: FastifyReply,
  resource: T | null | undefined,
  resourceName: string = 'Resource'
): Promise<boolean> {
  if (!resource) {
    reply.status(404).send({
      success: false,
      error: {
        code: ErrorCodes.NOT_FOUND,
        message: `${resourceName} not found`,
      },
    });
    return false;
  }

  // System admin can access any resource
  if (request.isAdmin) {
    return true;
  }

  // SaaS users must own the resource through their account
  const accountId = request.accountId;
  if (accountId) {
    if (resource.accountId !== accountId) {
      reply.status(403).send({
        success: false,
        error: {
          code: ErrorCodes.FORBIDDEN,
          message: `You do not have access to this ${resourceName.toLowerCase()}`,
        },
      });
      return false;
    }
    return true;
  }

  // No accountId and not admin - unauthorized
  reply.status(401).send({
    success: false,
    error: {
      code: ErrorCodes.UNAUTHORIZED,
      message: 'Authentication required',
    },
  });
  return false;
}
