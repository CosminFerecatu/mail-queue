import type { Redis } from 'ioredis';
import { getRedis } from './redis.js';

/**
 * Hierarchical Rate Limiter
 *
 * Implements:
 * - Global rate limit (all requests)
 * - Per-app rate limit
 * - Per-API key rate limit
 * - Per-queue rate limit (emails per minute)
 */

const RATE_LIMIT_PREFIX = 'ratelimit:';

interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

/**
 * Token bucket rate limiter using Redis
 * Uses a sliding window approach for accuracy
 */
export class HierarchicalRateLimiter {
  private redis: Redis;
  private globalLimit: number;

  constructor(globalLimit: number) {
    this.redis = getRedis();
    this.globalLimit = globalLimit;
  }

  /**
   * Check and consume rate limit for an API key
   */
  async checkApiKeyLimit(apiKeyId: string, customLimit?: number | null): Promise<RateLimitResult> {
    const limit = customLimit ?? this.globalLimit;
    const key = `${RATE_LIMIT_PREFIX}apikey:${apiKeyId}`;
    const windowMs = 60000; // 1 minute window

    return this.slidingWindowCheck(key, limit, windowMs);
  }

  /**
   * Check and consume rate limit for an app
   */
  async checkAppLimit(appId: string, dailyLimit?: number | null): Promise<RateLimitResult> {
    if (!dailyLimit) {
      return { allowed: true, limit: 0, remaining: 0, resetAt: 0 };
    }

    const key = `${RATE_LIMIT_PREFIX}app:${appId}:daily`;
    const windowMs = 86400000; // 24 hours

    return this.slidingWindowCheck(key, dailyLimit, windowMs);
  }

  /**
   * Check and consume rate limit for a queue (emails per minute)
   */
  async checkQueueLimit(queueId: string, rateLimit?: number | null): Promise<RateLimitResult> {
    if (!rateLimit) {
      return { allowed: true, limit: 0, remaining: 0, resetAt: 0 };
    }

    const key = `${RATE_LIMIT_PREFIX}queue:${queueId}`;
    const windowMs = 60000; // 1 minute window

    return this.slidingWindowCheck(key, rateLimit, windowMs);
  }

  /**
   * Check hierarchical rate limits (API key -> App -> Queue)
   * Returns the most restrictive result
   */
  async checkHierarchicalLimit(params: {
    apiKeyId: string;
    apiKeyLimit?: number | null;
    appId: string;
    appDailyLimit?: number | null;
    queueId?: string;
    queueRateLimit?: number | null;
  }): Promise<{
    allowed: boolean;
    results: {
      apiKey: RateLimitResult;
      app: RateLimitResult;
      queue?: RateLimitResult;
    };
    blockedBy?: 'apiKey' | 'app' | 'queue';
  }> {
    const [apiKeyResult, appResult] = await Promise.all([
      this.checkApiKeyLimit(params.apiKeyId, params.apiKeyLimit),
      this.checkAppLimit(params.appId, params.appDailyLimit),
    ]);

    let queueResult: RateLimitResult | undefined;
    if (params.queueId && params.queueRateLimit) {
      queueResult = await this.checkQueueLimit(params.queueId, params.queueRateLimit);
    }

    // Check which limit is blocking (if any)
    let blockedBy: 'apiKey' | 'app' | 'queue' | undefined;
    if (!apiKeyResult.allowed) {
      blockedBy = 'apiKey';
    } else if (!appResult.allowed) {
      blockedBy = 'app';
    } else if (queueResult && !queueResult.allowed) {
      blockedBy = 'queue';
    }

    return {
      allowed: !blockedBy,
      results: {
        apiKey: apiKeyResult,
        app: appResult,
        queue: queueResult,
      },
      blockedBy,
    };
  }

  /**
   * Sliding window rate limit check using Redis
   */
  private async slidingWindowCheck(
    key: string,
    limit: number,
    windowMs: number
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - windowMs;
    const resetAt = now + windowMs;

    // Lua script for atomic sliding window rate limiting
    const script = `
      local key = KEYS[1]
      local now = tonumber(ARGV[1])
      local window_start = tonumber(ARGV[2])
      local limit = tonumber(ARGV[3])
      local window_ms = tonumber(ARGV[4])

      -- Remove old entries outside the window
      redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)

      -- Count current requests in window
      local count = redis.call('ZCARD', key)

      if count < limit then
        -- Add current request
        redis.call('ZADD', key, now, now .. ':' .. math.random())
        -- Set expiry on the key
        redis.call('PEXPIRE', key, window_ms)
        return {1, limit - count - 1}
      else
        return {0, 0}
      end
    `;

    try {
      const result = (await this.redis.eval(
        script,
        1,
        key,
        now.toString(),
        windowStart.toString(),
        limit.toString(),
        windowMs.toString()
      )) as [number, number];

      return {
        allowed: result[0] === 1,
        limit,
        remaining: result[1],
        resetAt,
      };
    } catch (error) {
      // On Redis error, allow the request but log the error
      console.error('Rate limit check failed:', error);
      return {
        allowed: true,
        limit,
        remaining: limit,
        resetAt,
      };
    }
  }

  /**
   * Get current usage without consuming
   */
  async getUsage(key: string, windowMs: number): Promise<number> {
    const now = Date.now();
    const windowStart = now - windowMs;

    await this.redis.zremrangebyscore(key, '-inf', windowStart.toString());
    const count = await this.redis.zcard(key);

    return count;
  }

  /**
   * Reset rate limit for a specific key
   */
  async reset(key: string): Promise<void> {
    await this.redis.del(key);
  }

  /**
   * Get rate limit headers for HTTP response
   */
  getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
    return {
      'X-RateLimit-Limit': result.limit.toString(),
      'X-RateLimit-Remaining': result.remaining.toString(),
      'X-RateLimit-Reset': Math.ceil(result.resetAt / 1000).toString(),
    };
  }
}

// Singleton instance
let rateLimiter: HierarchicalRateLimiter | null = null;

export function getRateLimiter(globalLimit: number): HierarchicalRateLimiter {
  if (!rateLimiter) {
    rateLimiter = new HierarchicalRateLimiter(globalLimit);
  }
  return rateLimiter;
}
