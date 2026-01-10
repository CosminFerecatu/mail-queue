import { Redis } from 'ioredis';
import { config } from '../config.js';
import { logger } from './logger.js';

let redisClient: Redis | null = null;

export function getRedis(): Redis {
  if (!redisClient) {
    const client = new Redis(config.redisUrl, {
      maxRetriesPerRequest: null, // Required for BullMQ
      enableReadyCheck: true,
      retryStrategy: (times: number) => {
        if (times > 10) {
          logger.error('Redis connection failed after 10 retries');
          return null;
        }
        return Math.min(times * 100, 3000);
      },
    });

    client.on('connect', () => {
      logger.info('Redis connected');
    });

    client.on('error', (err: Error) => {
      logger.error({ err }, 'Redis error');
    });

    client.on('close', () => {
      logger.warn('Redis connection closed');
    });

    redisClient = client;
  }

  return redisClient;
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}

export async function checkRedisConnection(): Promise<boolean> {
  try {
    const redis = getRedis();
    await redis.ping();
    return true;
  } catch {
    return false;
  }
}
