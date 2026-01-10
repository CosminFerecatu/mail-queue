// Initialize tracing before other imports
import { initTracing, shutdown as shutdownTracing } from './lib/tracing.js';
initTracing();

import { Worker, type Job, type ConnectionOptions } from 'bullmq';
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

let emailWorker: Worker<SendEmailJobData> | null = null;
let webhookWorker: Worker<DeliverWebhookJobData> | null = null;
let trackingWorker: Worker<RecordTrackingJobData> | null = null;
let analyticsWorker: Worker<AggregateStatsJobData | UpdateReputationJobData> | null = null;
let stopScheduler: (() => void) | null = null;
let isShuttingDown = false;

async function main() {
  logger.info(
    {
      concurrency: config.concurrency,
      env: config.nodeEnv,
    },
    'Starting worker'
  );

  // Start metrics server
  startMetricsServer(9090);

  // Create email worker
  const redisConnection = getRedis() as unknown as ConnectionOptions;
  emailWorker = new Worker<SendEmailJobData>(
    QUEUE_NAMES.EMAIL,
    async (job: Job<SendEmailJobData>) => {
      await processEmailJob(job);
    },
    {
      connection: redisConnection,
      concurrency: config.concurrency,
      removeOnComplete: {
        age: 86400, // 24 hours
        count: 1000,
      },
      removeOnFail: {
        age: 604800, // 7 days
        count: 5000,
      },
    }
  );

  // Track active jobs count
  let activeJobsCount = 0;

  // Worker event handlers
  emailWorker.on('ready', () => {
    logger.info('Email worker ready');
    setWorkerStatus(true);
  });

  emailWorker.on('active', (job) => {
    activeJobsCount++;
    setActiveJobs(activeJobsCount);
    logger.debug(
      {
        jobId: job.id,
        emailId: job.data.emailId,
        attempt: job.attemptsMade + 1,
      },
      'Job active'
    );
  });

  emailWorker.on('completed', (job) => {
    activeJobsCount = Math.max(0, activeJobsCount - 1);
    setActiveJobs(activeJobsCount);
    logger.info(
      {
        jobId: job.id,
        emailId: job.data.emailId,
        duration: job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : null,
      },
      'Job completed'
    );
  });

  emailWorker.on('failed', (job, error) => {
    activeJobsCount = Math.max(0, activeJobsCount - 1);
    setActiveJobs(activeJobsCount);
    logger.error(
      {
        jobId: job?.id,
        emailId: job?.data.emailId,
        error: error.message,
        attempt: job?.attemptsMade,
      },
      'Job failed'
    );
  });

  emailWorker.on('error', (error) => {
    logger.error({ error }, 'Worker error');
  });

  emailWorker.on('stalled', (jobId) => {
    logger.warn({ jobId }, 'Job stalled');
  });

  // Create webhook worker
  webhookWorker = new Worker<DeliverWebhookJobData>(
    QUEUE_NAMES.WEBHOOK,
    async (job: Job<DeliverWebhookJobData>) => {
      await processWebhookJob(job);
    },
    {
      connection: redisConnection,
      concurrency: 5, // Lower concurrency for webhooks
      removeOnComplete: {
        age: 3600, // 1 hour
        count: 500,
      },
      removeOnFail: {
        age: 604800, // 7 days
        count: 1000,
      },
    }
  );

  webhookWorker.on('ready', () => {
    logger.info('Webhook worker ready');
  });

  webhookWorker.on('failed', (job, error) => {
    logger.error(
      {
        jobId: job?.id,
        deliveryId: job?.data.webhookDeliveryId,
        error: error.message,
      },
      'Webhook job failed'
    );
  });

  webhookWorker.on('error', (error) => {
    logger.error({ error }, 'Webhook worker error');
  });

  // Create tracking worker
  trackingWorker = new Worker<RecordTrackingJobData>(
    QUEUE_NAMES.TRACKING,
    async (job: Job<RecordTrackingJobData>) => {
      await processTrackingJob(job);
    },
    {
      connection: redisConnection,
      concurrency: 10, // Higher concurrency for fast tracking jobs
      removeOnComplete: {
        age: 3600,
        count: 10000,
      },
      removeOnFail: {
        age: 86400,
        count: 1000,
      },
    }
  );

  trackingWorker.on('ready', () => {
    logger.info('Tracking worker ready');
  });

  trackingWorker.on('failed', (job, error) => {
    logger.error(
      {
        jobId: job?.id,
        type: job?.data.type,
        emailId: job?.data.emailId,
        error: error.message,
      },
      'Tracking job failed'
    );
  });

  trackingWorker.on('error', (error) => {
    logger.error({ error }, 'Tracking worker error');
  });

  // Create analytics worker
  analyticsWorker = new Worker<AggregateStatsJobData | UpdateReputationJobData>(
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
      concurrency: 2, // Low concurrency for analytics
      removeOnComplete: {
        age: 3600,
        count: 100,
      },
      removeOnFail: {
        age: 86400,
        count: 100,
      },
    }
  );

  analyticsWorker.on('ready', () => {
    logger.info('Analytics worker ready');
  });

  analyticsWorker.on('failed', (job, error) => {
    logger.error(
      {
        jobId: job?.id,
        name: job?.name,
        error: error.message,
      },
      'Analytics job failed'
    );
  });

  analyticsWorker.on('error', (error) => {
    logger.error({ error }, 'Analytics worker error');
  });

  // Start the scheduler for recurring jobs (runs every minute)
  stopScheduler = startScheduler(60000);

  logger.info('All workers started');
}

// Graceful shutdown
async function shutdown(signal: string) {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  logger.info({ signal }, 'Shutting down worker...');

  // Set worker status to stopped
  setWorkerStatus(false);

  // Stop the scheduler
  if (stopScheduler) {
    stopScheduler();
    logger.info('Scheduler stopped');
  }

  try {
    // Close all workers (waits for active jobs to complete)
    if (emailWorker) {
      logger.info('Closing email worker...');
      await emailWorker.close();
      logger.info('Email worker closed');
    }

    if (webhookWorker) {
      logger.info('Closing webhook worker...');
      await webhookWorker.close();
      logger.info('Webhook worker closed');
    }

    if (trackingWorker) {
      logger.info('Closing tracking worker...');
      await trackingWorker.close();
      logger.info('Tracking worker closed');
    }

    if (analyticsWorker) {
      logger.info('Closing analytics worker...');
      await analyticsWorker.close();
      logger.info('Analytics worker closed');
    }

    // Close SMTP connections
    await closeAllConnections();
    logger.info('SMTP connections closed');

    // Close Redis
    await closeRedis();
    logger.info('Redis closed');

    // Close database
    await closeDatabase();
    logger.info('Database closed');

    // Stop metrics server
    await stopMetricsServer();

    // Shutdown tracing
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

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.fatal({ error }, 'Uncaught exception');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'Unhandled rejection');
  process.exit(1);
});

// Start the worker
main().catch((error) => {
  logger.fatal({ error }, 'Failed to start worker');
  process.exit(1);
});
