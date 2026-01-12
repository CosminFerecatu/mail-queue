import type { FastifyRequest, FastifyReply } from 'fastify';
import { ErrorCodes } from '../lib/error-codes.js';

/**
 * Shared authentication middleware helpers for consistent auth patterns across routes.
 *
 * These middleware helpers consolidate the repeated authentication checks found
 * throughout the route handlers into reusable functions.
 */

/**
 * Requires either:
 * - App authentication (via API key, sets request.appId)
 * - Account authentication (via SaaS JWT, sets request.accountId)
 * - Admin authentication (via admin secret or admin JWT)
 *
 * This is the most permissive auth check - allows any authenticated user.
 * Use this for endpoints that need to work for all auth types.
 *
 * @returns true if authorized, false if response was sent (caller should return early)
 */
export async function requireAppOrAccountAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<boolean> {
  // Admin users can always proceed
  if (request.isAdmin) {
    return true;
  }

  // SaaS users with account context can proceed
  if (request.accountId) {
    return true;
  }

  // API key authenticated users can proceed
  if (request.appId) {
    return true;
  }

  // No valid authentication found
  reply.status(401).send({
    success: false,
    error: {
      code: ErrorCodes.UNAUTHORIZED,
      message: 'App authentication required',
    },
  });
  return false;
}

/**
 * Requires app-level authentication specifically (via API key).
 *
 * Use this for endpoints that require an app context (e.g., sending emails).
 * Admin users without an appId will be rejected.
 *
 * @returns true if authorized, false if response was sent (caller should return early)
 */
export async function requireAppAuth(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  if (!request.appId) {
    reply.status(401).send({
      success: false,
      error: {
        code: ErrorCodes.UNAUTHORIZED,
        message: 'App authentication required',
      },
    });
    return false;
  }

  return true;
}

/**
 * Requires app-level authentication with a valid API key object.
 *
 * Use this for endpoints that need to access API key metadata (rate limits, scopes, etc).
 *
 * @returns true if authorized, false if response was sent (caller should return early)
 */
export async function requireApiKeyAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<boolean> {
  if (!request.appId || !request.apiKey) {
    reply.status(401).send({
      success: false,
      error: {
        code: ErrorCodes.UNAUTHORIZED,
        message: 'App authentication required',
      },
    });
    return false;
  }

  return true;
}

/**
 * Check if the request has any form of authentication.
 * Does not send a response - just returns the auth state.
 */
export function hasAnyAuth(request: FastifyRequest): boolean {
  return !!(request.isAdmin || request.accountId || request.appId);
}

/**
 * Check if the request is from an admin user.
 */
export function isAdminUser(request: FastifyRequest): boolean {
  return request.isAdmin === true;
}

/**
 * Check if the request is from a SaaS account user.
 */
export function isSaaSUser(request: FastifyRequest): boolean {
  return !!request.accountId;
}

/**
 * Check if the request is from an API key authenticated app.
 */
export function isAppUser(request: FastifyRequest): boolean {
  return !!request.appId;
}
