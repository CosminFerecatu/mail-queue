import {
  Registry,
  Counter,
  Histogram,
  Gauge,
  collectDefaultMetrics,
} from 'prom-client';
import { QUEUE_NAMES, type QueueName } from '@mail-queue/core';
import { getQueueStats } from './queue.js';
import { logger } from './logger.js';

// Create a custom registry
export const metricsRegistry = new Registry();

// Set default labels
metricsRegistry.setDefaultLabels({
  service: 'mail-queue-api',
});

// Collect default Node.js metrics (CPU, memory, event loop, etc.)
collectDefaultMetrics({ register: metricsRegistry });

// ============================================================================
// HTTP Metrics
// ============================================================================

export const httpRequestDuration = new Histogram({
  name: 'mailqueue_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

export const httpRequestTotal = new Counter({
  name: 'mailqueue_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [metricsRegistry],
});

// ============================================================================
// Email Metrics
// ============================================================================

export const emailsQueued = new Counter({
  name: 'mailqueue_emails_queued_total',
  help: 'Total number of emails queued',
  labelNames: ['app_id', 'queue'] as const,
  registers: [metricsRegistry],
});

export const emailsSent = new Counter({
  name: 'mailqueue_emails_sent_total',
  help: 'Total number of emails sent successfully',
  labelNames: ['app_id', 'queue'] as const,
  registers: [metricsRegistry],
});

export const emailsFailed = new Counter({
  name: 'mailqueue_emails_failed_total',
  help: 'Total number of emails that failed to send',
  labelNames: ['app_id', 'queue', 'error_type'] as const,
  registers: [metricsRegistry],
});

export const emailsBounced = new Counter({
  name: 'mailqueue_emails_bounced_total',
  help: 'Total number of bounced emails',
  labelNames: ['app_id', 'queue', 'bounce_type'] as const,
  registers: [metricsRegistry],
});

// ============================================================================
// Queue Metrics
// ============================================================================

export const queueDepth = new Gauge({
  name: 'mailqueue_queue_depth',
  help: 'Current number of jobs in the queue',
  labelNames: ['queue', 'state'] as const,
  registers: [metricsRegistry],
});

export const queueLatency = new Histogram({
  name: 'mailqueue_queue_latency_seconds',
  help: 'Time from email queued to processing started',
  labelNames: ['app_id', 'queue'] as const,
  buckets: [0.1, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300],
  registers: [metricsRegistry],
});

// ============================================================================
// Rate Limiting Metrics
// ============================================================================

export const rateLimitHits = new Counter({
  name: 'mailqueue_rate_limit_hits_total',
  help: 'Total number of rate limit hits',
  labelNames: ['app_id', 'limit_type'] as const,
  registers: [metricsRegistry],
});

// ============================================================================
// SMTP Metrics
// ============================================================================

export const smtpConnectionsActive = new Gauge({
  name: 'mailqueue_smtp_connections_active',
  help: 'Number of active SMTP connections',
  labelNames: ['host'] as const,
  registers: [metricsRegistry],
});

export const smtpSendDuration = new Histogram({
  name: 'mailqueue_smtp_send_duration_seconds',
  help: 'Duration of SMTP send operations',
  labelNames: ['host', 'status'] as const,
  buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
  registers: [metricsRegistry],
});

export const smtpErrors = new Counter({
  name: 'mailqueue_smtp_errors_total',
  help: 'Total number of SMTP errors',
  labelNames: ['host', 'error_type'] as const,
  registers: [metricsRegistry],
});

// ============================================================================
// Database Metrics
// ============================================================================

export const dbConnectionsActive = new Gauge({
  name: 'mailqueue_db_connections_active',
  help: 'Number of active database connections',
  registers: [metricsRegistry],
});

export const dbQueryDuration = new Histogram({
  name: 'mailqueue_db_query_duration_seconds',
  help: 'Duration of database queries',
  labelNames: ['operation', 'table'] as const,
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
  registers: [metricsRegistry],
});

// ============================================================================
// API Key Metrics
// ============================================================================

export const apiKeyUsage = new Counter({
  name: 'mailqueue_api_key_usage_total',
  help: 'Total number of API requests per key',
  labelNames: ['app_id', 'key_prefix'] as const,
  registers: [metricsRegistry],
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Update queue depth metrics from BullMQ queue stats
 */
export async function updateQueueMetrics(): Promise<void> {
  try {
    const stats = await getQueueStats(QUEUE_NAMES.EMAIL);

    queueDepth.set({ queue: 'email', state: 'waiting' }, stats.waiting);
    queueDepth.set({ queue: 'email', state: 'active' }, stats.active);
    queueDepth.set({ queue: 'email', state: 'delayed' }, stats.delayed);
    queueDepth.set({ queue: 'email', state: 'failed' }, stats.failed);
    queueDepth.set({ queue: 'email', state: 'completed' }, stats.completed);
  } catch (error) {
    logger.warn({ error }, 'Failed to update queue metrics');
  }
}

/**
 * Record email queued metric
 */
export function recordEmailQueued(appId: string, queueName: string): void {
  emailsQueued.inc({ app_id: appId, queue: queueName });
}

/**
 * Record email sent metric
 */
export function recordEmailSent(appId: string, queueName: string): void {
  emailsSent.inc({ app_id: appId, queue: queueName });
}

/**
 * Record email failed metric
 */
export function recordEmailFailed(appId: string, queueName: string, errorType: string): void {
  emailsFailed.inc({ app_id: appId, queue: queueName, error_type: errorType });
}

/**
 * Record email bounced metric
 */
export function recordEmailBounced(appId: string, queueName: string, bounceType: string): void {
  emailsBounced.inc({ app_id: appId, queue: queueName, bounce_type: bounceType });
}

/**
 * Record rate limit hit
 */
export function recordRateLimitHit(appId: string, limitType: string): void {
  rateLimitHits.inc({ app_id: appId, limit_type: limitType });
}

/**
 * Record API key usage
 */
export function recordApiKeyUsage(appId: string, keyPrefix: string): void {
  apiKeyUsage.inc({ app_id: appId, key_prefix: keyPrefix });
}

/**
 * Create a timer for HTTP request duration
 */
export function startHttpTimer(): (labels: { method: string; route: string; status_code: string }) => void {
  return httpRequestDuration.startTimer();
}

/**
 * Record HTTP request
 */
export function recordHttpRequest(method: string, route: string, statusCode: number): void {
  httpRequestTotal.inc({ method, route, status_code: statusCode.toString() });
}

/**
 * Get all metrics in Prometheus format
 */
export async function getMetrics(): Promise<string> {
  // Update queue metrics before returning
  await updateQueueMetrics();
  return metricsRegistry.metrics();
}

/**
 * Get metrics content type
 */
export function getMetricsContentType(): string {
  return metricsRegistry.contentType;
}
