import type { FastifyRequest, FastifyReply } from 'fastify';
import { getRedis } from './redis.js';

const IDEMPOTENCY_PREFIX = 'idempotency:';
const DEFAULT_TTL_SECONDS = 86400; // 24 hours

export interface CachedResponse {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
}

/**
 * Get idempotency key from request headers
 */
export function getIdempotencyKey(request: FastifyRequest): string | undefined {
  return request.headers['idempotency-key'] as string | undefined;
}

/**
 * Build Redis key for idempotency check
 * Scopes by appId to prevent cross-tenant collisions
 */
function buildKey(appId: string | undefined, idempotencyKey: string, endpoint: string): string {
  const scope = appId ?? 'admin';
  return `${IDEMPOTENCY_PREFIX}${scope}:${endpoint}:${idempotencyKey}`;
}

/**
 * Check if a response exists for this idempotency key
 */
export async function getCachedResponse(
  appId: string | undefined,
  idempotencyKey: string,
  endpoint: string
): Promise<CachedResponse | null> {
  const redis = getRedis();
  const key = buildKey(appId, idempotencyKey, endpoint);

  const cached = await redis.get(key);
  if (!cached) {
    return null;
  }

  try {
    return JSON.parse(cached) as CachedResponse;
  } catch {
    return null;
  }
}

/**
 * Cache a response for this idempotency key
 */
export async function cacheResponse(
  appId: string | undefined,
  idempotencyKey: string,
  endpoint: string,
  response: CachedResponse,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<void> {
  const redis = getRedis();
  const key = buildKey(appId, idempotencyKey, endpoint);

  await redis.setex(key, ttlSeconds, JSON.stringify(response));
}

/**
 * Handle idempotent request - check cache and return if exists
 * Returns true if a cached response was sent, false otherwise
 */
export async function handleIdempotentRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  endpoint: string
): Promise<boolean> {
  const idempotencyKey = getIdempotencyKey(request);
  if (!idempotencyKey) {
    return false;
  }

  const cached = await getCachedResponse(request.appId, idempotencyKey, endpoint);
  if (!cached) {
    return false;
  }

  // Apply cached headers
  for (const [key, value] of Object.entries(cached.headers)) {
    reply.header(key, value);
  }

  // Mark as cached response
  reply.header('X-Idempotency-Replayed', 'true');

  await reply.status(cached.statusCode).send(cached.body);
  return true;
}

/**
 * Cache successful response for idempotency replay
 * Only caches 2xx responses
 */
export async function cacheSuccessResponse(
  request: FastifyRequest,
  statusCode: number,
  body: unknown,
  endpoint: string,
  headers: Record<string, string> = {}
): Promise<void> {
  const idempotencyKey = getIdempotencyKey(request);
  if (!idempotencyKey) {
    return;
  }

  // Only cache successful responses (2xx)
  if (statusCode < 200 || statusCode >= 300) {
    return;
  }

  await cacheResponse(request.appId, idempotencyKey, endpoint, {
    statusCode,
    body,
    headers,
  });
}
