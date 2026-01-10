import { Worker, type Job, type ConnectionOptions } from 'bullmq';
import { QUEUE_NAMES, type SendEmailJobData } from '@mail-queue/core';
import { closeDatabase } from '@mail-queue/db';
import { config } from './config.js';
import { logger } from './lib/logger.js';
import { getRedis, closeRedis } from './lib/redis.js';
import { closeAllConnections } from './smtp/client.js';
import { processEmailJob } from './processors/email.processor.js';

let emailWorker: Worker<SendEmailJobData> | null = null;
let isShuttingDown = false;

async function main() {
  logger.info(
    {
      concurrency: config.concurrency,
      env: config.nodeEnv,
    },
    'Starting worker'
  );

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

  // Worker event handlers
  emailWorker.on('ready', () => {
    logger.info('Email worker ready');
  });

  emailWorker.on('active', (job) => {
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

  logger.info('Worker started');
}

// Graceful shutdown
async function shutdown(signal: string) {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  logger.info({ signal }, 'Shutting down worker...');

  try {
    // Close worker (waits for active jobs to complete)
    if (emailWorker) {
      logger.info('Closing email worker...');
      await emailWorker.close();
      logger.info('Email worker closed');
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
