import Fastify, { type FastifyInstance, type FastifyError } from 'fastify';
import fastifyCompress from '@fastify/compress';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifySensible from '@fastify/sensible';
import fastifyRateLimit from '@fastify/rate-limit';
import { config, isDevelopment } from './config.js';
import { getRedis } from './lib/redis.js';

// Middleware
import { authPlugin } from './middleware/auth.js';

// Plugins
import { metricsPlugin } from './plugins/metrics.js';

// Routes
import { authRoutes } from './routes/auth.js';
import { healthRoutes } from './routes/health.js';
import { metricsRoutes } from './routes/metrics.js';
import { emailRoutes } from './routes/emails.js';
import { appRoutes } from './routes/apps.js';
import { apiKeyRoutes } from './routes/apikeys.js';
import { queueRoutes } from './routes/queues.js';
import { smtpConfigRoutes } from './routes/smtp-configs.js';
import { analyticsRoutes } from './routes/analytics.js';
import { webhooksRoutes } from './routes/webhooks.js';
import { trackingRoutes } from './routes/tracking.js';
import { suppressionRoutes } from './routes/suppression.js';
import { scheduledJobsRoutes } from './routes/scheduled-jobs.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      ...(isDevelopment() && {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        },
      }),
    },
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
    disableRequestLogging: false,
  });

  // Error handler
  app.setErrorHandler((error: FastifyError, request, reply) => {
    const statusCode = error.statusCode ?? 500;

    // Log error
    if (statusCode >= 500) {
      request.log.error({ err: error }, 'Server error');
    } else {
      request.log.warn({ err: error }, 'Client error');
    }

    // Send response
    reply.status(statusCode).send({
      success: false,
      error: {
        code: error.code ?? 'INTERNAL_ERROR',
        message: statusCode >= 500 && !isDevelopment() ? 'Internal server error' : error.message,
        ...(isDevelopment() && { stack: error.stack }),
      },
    });
  });

  // Not found handler
  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Route ${request.method} ${request.url} not found`,
      },
    });
  });

  // Register plugins
  await app.register(fastifySensible);

  await app.register(fastifyHelmet, {
    contentSecurityPolicy: false, // Disable for API
  });

  await app.register(fastifyCompress);

  await app.register(fastifyCors, {
    origin: !!isDevelopment(),
    credentials: true,
  });

  await app.register(fastifyRateLimit, {
    global: true,
    max: config.globalRateLimit,
    timeWindow: '1 minute',
    redis: getRedis(),
    keyGenerator: (request) => {
      // Use API key or IP for rate limiting
      const apiKey = request.headers['authorization'];
      return apiKey ?? request.ip;
    },
    errorResponseBuilder: (_request, context) => ({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Rate limit exceeded. Retry after ${Math.ceil(context.ttl / 1000)} seconds`,
        retryAfter: Math.ceil(context.ttl / 1000),
      },
    }),
  });

  // Register auth plugin
  await app.register(authPlugin);

  // Register metrics plugin (must be after auth to have access to appId)
  await app.register(metricsPlugin);

  // Register routes
  // Metrics endpoint (no prefix, no auth - protected at infrastructure level)
  await app.register(metricsRoutes);
  // Tracking routes (no prefix, no auth - public endpoints for pixel/redirect)
  await app.register(trackingRoutes);
  await app.register(authRoutes, { prefix: '/v1/auth' });
  await app.register(healthRoutes, { prefix: '/v1' });
  await app.register(emailRoutes, { prefix: '/v1' });
  await app.register(appRoutes, { prefix: '/v1' });
  await app.register(apiKeyRoutes, { prefix: '/v1' });
  await app.register(queueRoutes, { prefix: '/v1' });
  await app.register(smtpConfigRoutes, { prefix: '/v1' });
  await app.register(analyticsRoutes, { prefix: '/v1' });
  await app.register(webhooksRoutes, { prefix: '/v1' });
  await app.register(suppressionRoutes, { prefix: '/v1' });
  await app.register(scheduledJobsRoutes, { prefix: '/v1' });

  // Root route
  app.get('/', async () => ({
    name: 'mail-queue-api',
    version: process.env['npm_package_version'] ?? '0.0.1',
    docs: '/v1/docs',
  }));

  return app;
}
