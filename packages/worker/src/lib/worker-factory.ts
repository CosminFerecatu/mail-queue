import { Worker, type Job, type ConnectionOptions } from 'bullmq';
import { logger } from './logger.js';

/**
 * Configuration for worker job retention
 */
export interface RetentionConfig {
  age: number;
  count: number;
}

/**
 * Configuration for creating a worker
 */
export interface WorkerConfig {
  connection: ConnectionOptions;
  concurrency: number;
  removeOnComplete: RetentionConfig;
  removeOnFail: RetentionConfig;
}

/**
 * Event handlers for worker lifecycle events
 */
export interface WorkerEventHandlers<T> {
  onReady?: () => void;
  onActive?: (job: Job<T>) => void;
  onCompleted?: (job: Job<T>) => void;
  onFailed?: (job: Job<T> | undefined, error: Error) => void;
  onError?: (error: Error) => void;
  onStalled?: (jobId: string) => void;
}

/**
 * Create a typed worker with standard configuration and event handlers
 */
export function createWorker<T>(
  queueName: string,
  processor: (job: Job<T>) => Promise<void>,
  config: WorkerConfig,
  handlers?: WorkerEventHandlers<T>
): Worker<T> {
  const worker = new Worker<T>(
    queueName,
    async (job: Job<T>) => {
      await processor(job);
    },
    {
      connection: config.connection,
      concurrency: config.concurrency,
      removeOnComplete: config.removeOnComplete,
      removeOnFail: config.removeOnFail,
    }
  );

  // Attach event handlers
  if (handlers?.onReady) {
    worker.on('ready', handlers.onReady);
  }

  if (handlers?.onActive) {
    worker.on('active', handlers.onActive);
  }

  if (handlers?.onCompleted) {
    worker.on('completed', handlers.onCompleted);
  }

  if (handlers?.onFailed) {
    worker.on('failed', handlers.onFailed);
  }

  if (handlers?.onError) {
    worker.on('error', handlers.onError);
  }

  if (handlers?.onStalled) {
    worker.on('stalled', handlers.onStalled);
  }

  return worker;
}

/**
 * Create standard error handler that logs worker errors
 */
export function createErrorHandler(workerName: string): (error: Error) => void {
  return (error: Error) => {
    logger.error({ error }, `${workerName} worker error`);
  };
}

/**
 * Create standard failed job handler that logs job failures
 */
export function createFailedHandler<T>(
  workerName: string,
  getJobDetails: (job: Job<T> | undefined) => Record<string, unknown>
): (job: Job<T> | undefined, error: Error) => void {
  return (job: Job<T> | undefined, error: Error) => {
    logger.error(
      {
        jobId: job?.id,
        ...getJobDetails(job),
        error: error.message,
      },
      `${workerName} job failed`
    );
  };
}
