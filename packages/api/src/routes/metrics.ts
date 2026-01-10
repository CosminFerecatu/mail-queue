import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { getMetrics, getMetricsContentType } from '../lib/metrics.js';

export const metricsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Prometheus metrics endpoint
  // This should NOT be rate-limited or require authentication
  // but should be protected at the infrastructure level (e.g., only accessible internally)
  app.get('/metrics', async (_request, reply) => {
    const metrics = await getMetrics();

    reply.header('Content-Type', getMetricsContentType()).send(metrics);
  });
};
