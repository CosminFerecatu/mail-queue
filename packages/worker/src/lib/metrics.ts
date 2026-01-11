import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';
import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { logger } from './logger.js';
import { config, isProduction } from '../config.js';

// Create a custom registry
export const metricsRegistry = new Registry();

// Set default labels
metricsRegistry.setDefaultLabels({
  service: 'mail-queue-worker',
});

// Collect default Node.js metrics
collectDefaultMetrics({ register: metricsRegistry });

// ============================================================================
// Email Processing Metrics
// ============================================================================

export const emailsProcessed = new Counter({
  name: 'mailqueue_worker_emails_processed_total',
  help: 'Total number of emails processed by the worker',
  labelNames: ['app_id', 'queue', 'status'] as const,
  registers: [metricsRegistry],
});

export const emailProcessingDuration = new Histogram({
  name: 'mailqueue_worker_email_processing_duration_seconds',
  help: 'Duration of email processing in seconds',
  labelNames: ['app_id', 'queue'] as const,
  buckets: [0.1, 0.5, 1, 2.5, 5, 10, 30, 60, 120],
  registers: [metricsRegistry],
});

export const emailRetries = new Counter({
  name: 'mailqueue_worker_email_retries_total',
  help: 'Total number of email processing retries',
  labelNames: ['app_id', 'queue'] as const,
  registers: [metricsRegistry],
});

// ============================================================================
// SMTP Metrics
// ============================================================================

export const smtpConnectionsActive = new Gauge({
  name: 'mailqueue_worker_smtp_connections_active',
  help: 'Number of active SMTP connections',
  labelNames: ['host'] as const,
  registers: [metricsRegistry],
});

export const smtpSendDuration = new Histogram({
  name: 'mailqueue_worker_smtp_send_duration_seconds',
  help: 'Duration of SMTP send operations',
  labelNames: ['host', 'status'] as const,
  buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
  registers: [metricsRegistry],
});

export const smtpErrors = new Counter({
  name: 'mailqueue_worker_smtp_errors_total',
  help: 'Total number of SMTP errors',
  labelNames: ['host', 'error_type'] as const,
  registers: [metricsRegistry],
});

// ============================================================================
// Worker Metrics
// ============================================================================

export const workerActiveJobs = new Gauge({
  name: 'mailqueue_worker_active_jobs',
  help: 'Number of jobs currently being processed',
  registers: [metricsRegistry],
});

export const workerStatus = new Gauge({
  name: 'mailqueue_worker_status',
  help: 'Worker status (1 = running, 0 = stopped)',
  registers: [metricsRegistry],
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Record email processed metric
 */
export function recordEmailProcessed(
  appId: string,
  queueName: string,
  status: 'sent' | 'failed' | 'bounced'
): void {
  emailsProcessed.inc({ app_id: appId, queue: queueName, status });
}

/**
 * Start timer for email processing
 */
export function startEmailProcessingTimer(): (labels: { app_id: string; queue: string }) => void {
  return emailProcessingDuration.startTimer();
}

/**
 * Record email retry
 */
export function recordEmailRetry(appId: string, queueName: string): void {
  emailRetries.inc({ app_id: appId, queue: queueName });
}

/**
 * Record SMTP send duration
 */
export function recordSmtpSend(
  host: string,
  status: 'success' | 'failure',
  durationSeconds: number
): void {
  smtpSendDuration.observe({ host, status }, durationSeconds);
}

/**
 * Record SMTP error
 */
export function recordSmtpError(host: string, errorType: string): void {
  smtpErrors.inc({ host, error_type: errorType });
}

/**
 * Set worker status
 */
export function setWorkerStatus(running: boolean): void {
  workerStatus.set(running ? 1 : 0);
}

/**
 * Set active jobs count
 */
export function setActiveJobs(count: number): void {
  workerActiveJobs.set(count);
}

/**
 * Set active SMTP connections
 */
export function setSmtpConnections(host: string, count: number): void {
  smtpConnectionsActive.set({ host }, count);
}

// ============================================================================
// Metrics Server
// ============================================================================

let metricsServer: http.Server | null = null;

/**
 * Verify basic auth credentials using constant-time comparison
 */
function verifyBasicAuth(authHeader: string | undefined): boolean {
  const expectedUser = config.metricsAuthUser;
  const expectedPass = config.metricsAuthPass;

  // If no auth configured, allow access (but warn in production)
  if (!expectedUser || !expectedPass) {
    return true;
  }

  if (!authHeader?.startsWith('Basic ')) {
    return false;
  }

  try {
    const base64Credentials = authHeader.slice(6);
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf8');
    const [user, pass] = credentials.split(':');

    if (!user || !pass) {
      return false;
    }

    // Use constant-time comparison to prevent timing attacks
    const userBuffer = Buffer.from(user);
    const passBuffer = Buffer.from(pass);
    const expectedUserBuffer = Buffer.from(expectedUser);
    const expectedPassBuffer = Buffer.from(expectedPass);

    // Check lengths first (timingSafeEqual requires same length)
    const userLengthMatch = userBuffer.length === expectedUserBuffer.length;
    const passLengthMatch = passBuffer.length === expectedPassBuffer.length;

    if (!userLengthMatch || !passLengthMatch) {
      return false;
    }

    const userMatch = timingSafeEqual(userBuffer, expectedUserBuffer);
    const passMatch = timingSafeEqual(passBuffer, expectedPassBuffer);

    return userMatch && passMatch;
  } catch {
    return false;
  }
}

/**
 * Check if metrics authentication is configured
 */
function isMetricsAuthConfigured(): boolean {
  return !!(config.metricsAuthUser && config.metricsAuthPass);
}

/**
 * Start a simple HTTP server for Prometheus to scrape metrics
 */
export function startMetricsServer(port = 9090): void {
  if (metricsServer) {
    logger.warn('Metrics server already running');
    return;
  }

  // Warn if no authentication configured in production
  if (isProduction() && !isMetricsAuthConfigured()) {
    logger.warn(
      { port },
      'Metrics endpoint has no authentication configured. ' +
        'Set METRICS_AUTH_USER and METRICS_AUTH_PASS environment variables, ' +
        'or ensure this port is not exposed externally.'
    );
  }

  metricsServer = http.createServer(async (req, res) => {
    if (req.url === '/metrics' && req.method === 'GET') {
      // Check authentication for metrics endpoint
      if (isMetricsAuthConfigured() && !verifyBasicAuth(req.headers.authorization)) {
        res.writeHead(401, {
          'WWW-Authenticate': 'Basic realm="Metrics"',
          'Content-Type': 'text/plain',
        });
        res.end('Unauthorized');
        return;
      }

      try {
        const metrics = await metricsRegistry.metrics();
        res.writeHead(200, { 'Content-Type': metricsRegistry.contentType });
        res.end(metrics);
      } catch (error) {
        logger.error({ error }, 'Failed to get metrics');
        res.writeHead(500);
        res.end('Error getting metrics');
      }
    } else if (req.url === '/health' && req.method === 'GET') {
      // Health endpoint remains unauthenticated for load balancer probes
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'healthy' }));
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  metricsServer.listen(port, () => {
    logger.info({ port, authEnabled: isMetricsAuthConfigured() }, 'Metrics server started');
  });
}

/**
 * Stop the metrics server
 */
export function stopMetricsServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!metricsServer) {
      resolve();
      return;
    }

    metricsServer.close(() => {
      logger.info('Metrics server stopped');
      metricsServer = null;
      resolve();
    });
  });
}
