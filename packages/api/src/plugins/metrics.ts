import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import {
  startHttpTimer,
  recordHttpRequest,
  recordApiKeyUsage,
} from '../lib/metrics.js';

const metricsPluginCallback: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Hook to start timing before the request is processed
  fastify.addHook('onRequest', async (request) => {
    // Store the timer on the request object
    (request as any).metricsTimer = startHttpTimer();
  });

  // Hook to record metrics after the response is sent
  fastify.addHook('onResponse', async (request, reply) => {
    // Get the timer from the request
    const timer = (request as any).metricsTimer as
      | ((labels: { method: string; route: string; status_code: string }) => void)
      | undefined;

    // Determine the route pattern (use the matched route or the URL)
    const route = request.routeOptions?.url ?? request.url;

    // Stop the timer and record duration
    if (timer) {
      timer({
        method: request.method,
        route,
        status_code: reply.statusCode.toString(),
      });
    }

    // Record the request count
    recordHttpRequest(request.method, route, reply.statusCode);

    // Record API key usage if authenticated
    if (request.appId && request.apiKey) {
      recordApiKeyUsage(request.appId, request.apiKey.keyPrefix);
    }
  });
};

export const metricsPlugin = fp(metricsPluginCallback, {
  name: 'metrics-plugin',
  fastify: '5.x',
});
