// Initialize tracing before other imports
import { initTracing, shutdown as shutdownTracing } from './lib/tracing.js';
initTracing();

import type { Worker, Job, ConnectionOptions } from 'bullmq';
import {
  QUEUE_NAMES,
  type SendEmailJobData,
  type DeliverWebhookJobData,
  type RecordTrackingJobData,
  type AggregateStatsJobData,
  type UpdateReputationJobData,
  JOB_TYPES,
} from '@mail-queue/core';
import { closeDatabase } from '@mail-queue/db';
import { config } from './config.js';
import { logger } from './lib/logger.js';
import { getRedis, closeRedis } from './lib/redis.js';
import { closeAllConnections } from './smtp/client.js';
import { processEmailJob } from './processors/email.processor.js';
import { processWebhookJob } from './processors/webhook.processor.js';
import { processTrackingJob } from './processors/tracking.processor.js';
import {
  processAggregateStatsJob,
  processReputationUpdateJob,
} from './processors/analytics.processor.js';
import { startScheduler } from './processors/scheduler.processor.js';
import {
  startMetricsServer,
  stopMetricsServer,
  setWorkerStatus,
  setActiveJobs,
} from './lib/metrics.js';
import {
  createWorker,
  createErrorHandler,
  createFailedHandler,
  type WorkerConfig,
} from './lib/worker-factory.js';
import {
  EMAIL_RETENTION_COMPLETED_AGE_SECONDS,
  EMAIL_RETENTION_COMPLETED_COUNT,
  EMAIL_RETENTION_FAILED_AGE_SECONDS,
  EMAIL_RETENTION_FAILED_COUNT,
  WEBHOOK_RETENTION_COMPLETED_AGE_SECONDS,
  WEBHOOK_RETENTION_COMPLETED_COUNT,
  WEBHOOK_RETENTION_FAILED_AGE_SECONDS,
  WEBHOOK_RETENTION_FAILED_COUNT,
  TRACKING_RETENTION_COMPLETED_AGE_SECONDS,
  TRACKING_RETENTION_COMPLETED_COUNT,
  TRACKING_RETENTION_FAILED_AGE_SECONDS,
  TRACKING_RETENTION_FAILED_COUNT,
  ANALYTICS_RETENTION_COMPLETED_AGE_SECONDS,
  ANALYTICS_RETENTION_COMPLETED_COUNT,
  ANALYTICS_RETENTION_FAILED_AGE_SECONDS,
  ANALYTICS_RETENTION_FAILED_COUNT,
  WEBHOOK_WORKER_CONCURRENCY,
  TRACKING_WORKER_CONCURRENCY,
  ANALYTICS_WORKER_CONCURRENCY,
  SCHEDULER_INTERVAL_MS,
} from './constants.js';

let emailWorker: Worker<SendEmailJobData> | null = null;
let webhookWorker: Worker<DeliverWebhookJobData> | null = null;
let trackingWorker: Worker<RecordTrackingJobData> | null = null;
let analyticsWorker: Worker<AggregateStatsJobData | UpdateReputationJobData> | null = null;
let stopScheduler: (() => void) | null = null;
let isShuttingDown = false;

// Track active jobs count for metrics
let activeJobsCount = 0;

function incrementActiveJobs(): void {
  activeJobsCount++;
  setActiveJobs(activeJobsCount);
}

function decrementActiveJobs(): void {
  activeJobsCount = Math.max(0, activeJobsCount - 1);
  setActiveJobs(activeJobsCount);
}

async function main() {
  logger.info(
    {
      concurrency: config.concurrency,
      env: config.nodeEnv,
    },
    'Starting worker'
  );

  startMetricsServer(config.metricsPort);

  const redisConnection = getRedis() as unknown as ConnectionOptions;

  // Create email worker with full event tracking
  const emailConfig: WorkerConfig = {
    connection: redisConnection,
    concurrency: config.concurrency,
    removeOnComplete: {
      age: EMAIL_RETENTION_COMPLETED_AGE_SECONDS,
      count: EMAIL_RETENTION_COMPLETED_COUNT,
    },
    removeOnFail: {
      age: EMAIL_RETENTION_FAILED_AGE_SECONDS,
      count: EMAIL_RETENTION_FAILED_COUNT,
    },
  };

  emailWorker = createWorker<SendEmailJobData>(QUEUE_NAMES.EMAIL, processEmailJob, emailConfig, {
    onReady: () => {
      logger.info('Email worker ready');
      setWorkerStatus(true);
    },
    onActive: (job) => {
      incrementActiveJobs();
      logger.debug(
        { jobId: job.id, emailId: job.data.emailId, attempt: job.attemptsMade + 1 },
        'Job active'
      );
    },
    onCompleted: (job) => {
      decrementActiveJobs();
      logger.info(
        {
          jobId: job.id,
          emailId: job.data.emailId,
          duration: job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : null,
        },
        'Job completed'
      );
    },
    onFailed: (job, error) => {
      decrementActiveJobs();
      logger.error(
        {
          jobId: job?.id,
          emailId: job?.data.emailId,
          error: error.message,
          attempt: job?.attemptsMade,
        },
        'Job failed'
      );
    },
    onError: createErrorHandler('Email'),
    onStalled: (jobId) => logger.warn({ jobId }, 'Job stalled'),
  });

  // Create webhook worker
  webhookWorker = createWorker<DeliverWebhookJobData>(
    QUEUE_NAMES.WEBHOOK,
    processWebhookJob,
    {
      connection: redisConnection,
      concurrency: WEBHOOK_WORKER_CONCURRENCY,
      removeOnComplete: {
        age: WEBHOOK_RETENTION_COMPLETED_AGE_SECONDS,
        count: WEBHOOK_RETENTION_COMPLETED_COUNT,
      },
      removeOnFail: {
        age: WEBHOOK_RETENTION_FAILED_AGE_SECONDS,
        count: WEBHOOK_RETENTION_FAILED_COUNT,
      },
    },
    {
      onReady: () => logger.info('Webhook worker ready'),
      onFailed: createFailedHandler('Webhook', (job) => ({
        deliveryId: job?.data.webhookDeliveryId,
      })),
      onError: createErrorHandler('Webhook'),
    }
  );

  // Create tracking worker
  trackingWorker = createWorker<RecordTrackingJobData>(
    QUEUE_NAMES.TRACKING,
    processTrackingJob,
    {
      connection: redisConnection,
      concurrency: TRACKING_WORKER_CONCURRENCY,
      removeOnComplete: {
        age: TRACKING_RETENTION_COMPLETED_AGE_SECONDS,
        count: TRACKING_RETENTION_COMPLETED_COUNT,
      },
      removeOnFail: {
        age: TRACKING_RETENTION_FAILED_AGE_SECONDS,
        count: TRACKING_RETENTION_FAILED_COUNT,
      },
    },
    {
      onReady: () => logger.info('Tracking worker ready'),
      onFailed: createFailedHandler('Tracking', (job) => ({
        type: job?.data.type,
        emailId: job?.data.emailId,
      })),
      onError: createErrorHandler('Tracking'),
    }
  );

  // Create analytics worker with job type routing
  analyticsWorker = createWorker<AggregateStatsJobData | UpdateReputationJobData>(
    QUEUE_NAMES.ANALYTICS,
    async (job: Job<AggregateStatsJobData | UpdateReputationJobData>) => {
      if (job.name === JOB_TYPES.AGGREGATE_STATS) {
        await processAggregateStatsJob(job as Job<AggregateStatsJobData>);
      } else if (job.name === JOB_TYPES.UPDATE_REPUTATION) {
        await processReputationUpdateJob(job as Job<UpdateReputationJobData>);
      }
    },
    {
      connection: redisConnection,
      concurrency: ANALYTICS_WORKER_CONCURRENCY,
      removeOnComplete: {
        age: ANALYTICS_RETENTION_COMPLETED_AGE_SECONDS,
        count: ANALYTICS_RETENTION_COMPLETED_COUNT,
      },
      removeOnFail: {
        age: ANALYTICS_RETENTION_FAILED_AGE_SECONDS,
        count: ANALYTICS_RETENTION_FAILED_COUNT,
      },
    },
    {
      onReady: () => logger.info('Analytics worker ready'),
      onFailed: createFailedHandler('Analytics', (job) => ({ name: job?.name })),
      onError: createErrorHandler('Analytics'),
    }
  );

  // Start the scheduler for recurring jobs
  stopScheduler = startScheduler(SCHEDULER_INTERVAL_MS);

  logger.info('All workers started');
}

async function shutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info({ signal }, 'Shutting down worker...');
  setWorkerStatus(false);

  if (stopScheduler) {
    stopScheduler();
    logger.info('Scheduler stopped');
  }

  try {
    // Close all workers (waits for active jobs to complete)
    const workers = [
      { worker: emailWorker, name: 'Email' },
      { worker: webhookWorker, name: 'Webhook' },
      { worker: trackingWorker, name: 'Tracking' },
      { worker: analyticsWorker, name: 'Analytics' },
    ];

    for (const { worker, name } of workers) {
      if (worker) {
        logger.info(`Closing ${name} worker...`);
        await worker.close();
        logger.info(`${name} worker closed`);
      }
    }

    await closeAllConnections();
    logger.info('SMTP connections closed');

    await closeRedis();
    logger.info('Redis closed');

    await closeDatabase();
    logger.info('Database closed');

    await stopMetricsServer();
    await shutdownTracing();

    logger.info('Shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'Error during shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('uncaughtException', (error) => {
  logger.fatal({ error }, 'Uncaught exception');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'Unhandled rejection');
  process.exit(1);
});

main().catch((error) => {
  logger.fatal({ error }, 'Failed to start worker');
  process.exit(1);
});
