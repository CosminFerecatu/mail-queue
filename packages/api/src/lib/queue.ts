import { Queue, type ConnectionOptions } from 'bullmq';
import {
  QUEUE_NAMES,
  DEFAULT_JOB_OPTIONS,
  queuePriorityToBullMQ,
  type SendEmailJobData,
  type QueueName,
} from '@mail-queue/core';
import { getRedis } from './redis.js';
import { logger } from './logger.js';

const queues = new Map<QueueName, Queue>();

export function getQueue(name: QueueName): Queue {
  let queue = queues.get(name);

  if (!queue) {
    const redisConnection = getRedis() as unknown as ConnectionOptions;
    queue = new Queue(name, {
      connection: redisConnection,
      defaultJobOptions: DEFAULT_JOB_OPTIONS[name],
    });

    queue.on('error', (err) => {
      logger.error({ err, queue: name }, 'Queue error');
    });

    queues.set(name, queue);
    logger.debug({ queue: name }, 'Queue created');
  }

  return queue;
}

export async function addEmailJob(data: SendEmailJobData): Promise<string> {
  const queue = getQueue(QUEUE_NAMES.EMAIL);

  const job = await queue.add('send-email', data, {
    priority: queuePriorityToBullMQ(data.priority),
    jobId: data.emailId, // Use email ID as job ID for idempotency
  });

  logger.debug(
    {
      jobId: job.id,
      emailId: data.emailId,
      priority: data.priority,
    },
    'Email job added to queue'
  );

  return job.id ?? data.emailId;
}

export async function addDelayedEmailJob(
  data: SendEmailJobData,
  delayMs: number
): Promise<string> {
  const queue = getQueue(QUEUE_NAMES.EMAIL);

  const job = await queue.add('send-email', data, {
    priority: queuePriorityToBullMQ(data.priority),
    jobId: data.emailId,
    delay: delayMs,
  });

  logger.debug(
    {
      jobId: job.id,
      emailId: data.emailId,
      delayMs,
    },
    'Delayed email job added to queue'
  );

  return job.id ?? data.emailId;
}

export async function getEmailJobStatus(emailId: string): Promise<{
  state: string;
  progress: number;
  attemptsMade: number;
  failedReason?: string;
} | null> {
  const queue = getQueue(QUEUE_NAMES.EMAIL);
  const job = await queue.getJob(emailId);

  if (!job) {
    return null;
  }

  const state = await job.getState();

  return {
    state,
    progress: job.progress as number,
    attemptsMade: job.attemptsMade,
    failedReason: job.failedReason,
  };
}

export async function closeQueues(): Promise<void> {
  for (const [name, queue] of queues) {
    await queue.close();
    logger.debug({ queue: name }, 'Queue closed');
  }
  queues.clear();
}

export async function getQueueStats(name: QueueName): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
}> {
  const queue = getQueue(name);

  const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
    queue.isPaused().then((isPaused) => (isPaused ? 1 : 0)),
  ]);

  return { waiting, active, completed, failed, delayed, paused };
}

export function getEmailQueue(): Queue {
  return getQueue(QUEUE_NAMES.EMAIL);
}
