import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { getDatabase, checkDatabaseConnection } from '@mail-queue/db';
import { checkRedisConnection } from '../lib/redis.js';
import { getQueueStats } from '../lib/queue.js';
import { QUEUE_NAMES, type HealthCheckStatus, type HealthCheckResponse } from '@mail-queue/core';

const startTime = Date.now();

export const healthRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Simple health check
  app.get('/health', async () => ({
    status: 'healthy',
    timestamp: new Date().toISOString(),
  }));

  // Detailed health check
  app.get('/health/detailed', async (_request, reply) => {
    const checks: Record<string, { status: HealthCheckStatus; latencyMs?: number; message?: string }> = {};

    // Check PostgreSQL
    const pgStart = Date.now();
    const pgHealthy = await checkDatabaseConnection(getDatabase());
    checks['postgresql'] = {
      status: pgHealthy ? 'healthy' : 'unhealthy',
      latencyMs: Date.now() - pgStart,
    };

    // Check Redis
    const redisStart = Date.now();
    const redisHealthy = await checkRedisConnection();
    checks['redis'] = {
      status: redisHealthy ? 'healthy' : 'unhealthy',
      latencyMs: Date.now() - redisStart,
    };

    // Determine overall status
    const allHealthy = Object.values(checks).every((c) => c.status === 'healthy');
    const anyUnhealthy = Object.values(checks).some((c) => c.status === 'unhealthy');

    let overallStatus: HealthCheckStatus = 'healthy';
    if (anyUnhealthy) {
      overallStatus = 'unhealthy';
    } else if (!allHealthy) {
      overallStatus = 'degraded';
    }

    // Get queue stats
    let queueStats: { totalPending: number; totalProcessing: number } | undefined;
    try {
      const emailQueueStats = await getQueueStats(QUEUE_NAMES.EMAIL);
      queueStats = {
        totalPending: emailQueueStats.waiting + emailQueueStats.delayed,
        totalProcessing: emailQueueStats.active,
      };
    } catch {
      // Queue stats not available
    }

    const response: HealthCheckResponse = {
      status: overallStatus,
      version: process.env['npm_package_version'] ?? '0.0.1',
      uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
      checks: {
        postgresql: checks['postgresql']!,
        redis: checks['redis']!,
      },
      queues: queueStats,
    };

    // Return appropriate status code
    const statusCode = overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 200 : 503;
    reply.status(statusCode).send(response);
  });

  // Liveness probe (for k8s)
  app.get('/health/live', async () => ({
    status: 'alive',
  }));

  // Readiness probe (for k8s)
  app.get('/health/ready', async (_request, reply) => {
    const pgHealthy = await checkDatabaseConnection(getDatabase());
    const redisHealthy = await checkRedisConnection();

    if (pgHealthy && redisHealthy) {
      return { status: 'ready' };
    }

    reply.status(503).send({
      status: 'not_ready',
      checks: {
        postgresql: pgHealthy,
        redis: redisHealthy,
      },
    });
  });

  // API info
  app.get('/info', async () => ({
    name: 'mail-queue-api',
    version: process.env['npm_package_version'] ?? '0.0.1',
    nodeVersion: process.version,
    uptime: Math.floor((Date.now() - startTime) / 1000),
  }));
};
