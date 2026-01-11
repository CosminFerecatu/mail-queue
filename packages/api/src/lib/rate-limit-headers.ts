import type { FastifyRequest, FastifyReply } from 'fastify';
import { getRateLimiter } from './rate-limiter.js';
import { config } from '../config.js';

/**
 * Add rate limit headers to a response for an authenticated request
 * This provides consistent rate limit information across all endpoints
 */
export async function addRateLimitHeaders(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Only add headers for API key authenticated requests
  if (!request.apiKey) {
    return;
  }

  const rateLimiter = getRateLimiter(config.globalRateLimit);

  // Get current rate limit status without consuming
  // We use checkApiKeyLimit which does consume, but the request is already authenticated
  // so this is the normal rate limit check anyway
  const result = await rateLimiter.checkApiKeyLimit(request.apiKey.id, request.apiKey.rateLimit);

  const headers = rateLimiter.getRateLimitHeaders(result);

  for (const [key, value] of Object.entries(headers)) {
    reply.header(key, value);
  }
}

/**
 * Fastify onSend hook to add rate limit headers
 * Add this to your app to automatically include rate limit headers on all responses
 */
export async function rateLimitHeadersHook(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Skip if headers already set (e.g., by emails route which has more complex rate limiting)
  if (reply.getHeader('X-RateLimit-Limit')) {
    return;
  }

  await addRateLimitHeaders(request, reply);
}
