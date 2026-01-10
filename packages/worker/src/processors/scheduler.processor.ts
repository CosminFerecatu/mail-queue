import { eq, and, lte } from 'drizzle-orm';
import { getDatabase, scheduledJobs, queues, emails, emailEvents } from '@mail-queue/db';
import type { SendEmailJobData } from '@mail-queue/core';
import { logger } from '../lib/logger.js';
import { parseExpression } from 'cron-parser';
import { randomUUID } from 'node:crypto';
import { getRedis } from '../lib/redis.js';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '@mail-queue/core';

const schedulerLogger = logger.child({ processor: 'scheduler' });

interface EmailTemplate {
  from: { email: string; name?: string };
  subject: string;
  html?: string;
  text?: string;
  headers?: Record<string, string>;
}

/**
 * Calculate the next run time from a cron expression
 */
function calculateNextRunTime(cronExpression: string, timezone: string): Date | null {
  try {
    const interval = parseExpression(cronExpression, {
      currentDate: new Date(),
      tz: timezone,
    });
    return interval.next().toDate();
  } catch (error) {
    schedulerLogger.error({ cronExpression, timezone, error }, 'Failed to parse cron expression');
    return null;
  }
}

/**
 * Process due scheduled jobs
 * This should be called periodically (e.g., every minute) to check for jobs that need to run
 */
export async function processDueScheduledJobs(): Promise<number> {
  const db = getDatabase();
  const now = new Date();

  // Find all active jobs where nextRunAt <= now
  const dueJobs = await db
    .select({
      id: scheduledJobs.id,
      appId: scheduledJobs.appId,
      queueId: scheduledJobs.queueId,
      queueName: queues.name,
      name: scheduledJobs.name,
      cronExpression: scheduledJobs.cronExpression,
      timezone: scheduledJobs.timezone,
      emailTemplate: scheduledJobs.emailTemplate,
    })
    .from(scheduledJobs)
    .innerJoin(queues, eq(scheduledJobs.queueId, queues.id))
    .where(
      and(
        eq(scheduledJobs.isActive, true),
        lte(scheduledJobs.nextRunAt, now)
      )
    );

  schedulerLogger.info({ count: dueJobs.length }, 'Found due scheduled jobs');

  let processedCount = 0;

  for (const job of dueJobs) {
    try {
      await processScheduledJob(job);
      processedCount++;
    } catch (error) {
      schedulerLogger.error(
        { jobId: job.id, error },
        'Failed to process scheduled job'
      );
    }
  }

  schedulerLogger.info({ processedCount, totalDue: dueJobs.length }, 'Scheduled jobs processed');

  return processedCount;
}

/**
 * Process a single scheduled job
 */
async function processScheduledJob(job: {
  id: string;
  appId: string;
  queueId: string;
  queueName: string;
  name: string;
  cronExpression: string;
  timezone: string;
  emailTemplate: unknown;
}): Promise<void> {
  const db = getDatabase();
  const now = new Date();
  const emailTemplate = job.emailTemplate as EmailTemplate;

  schedulerLogger.info({ jobId: job.id, jobName: job.name }, 'Processing scheduled job');

  // Create an email from the template
  // Note: In a real implementation, you would also need to handle recipients
  // For now, we'll just log that the job ran since we don't have recipient data
  const emailId = randomUUID();

  // For scheduled jobs, we need recipients. Since the current schema doesn't have
  // a recipients field, we'll log this as a template that would need recipients.
  // In production, you'd either:
  // 1. Add a recipients field to scheduledJobs
  // 2. Query a separate table for recipients
  // 3. Use a dynamic recipient source

  schedulerLogger.info(
    {
      jobId: job.id,
      jobName: job.name,
      template: {
        from: emailTemplate.from,
        subject: emailTemplate.subject,
        hasHtml: !!emailTemplate.html,
        hasText: !!emailTemplate.text,
      },
    },
    'Scheduled job template ready (recipients need to be configured)'
  );

  // Calculate and update next run time
  const nextRunAt = calculateNextRunTime(job.cronExpression, job.timezone);

  await db
    .update(scheduledJobs)
    .set({
      lastRunAt: now,
      nextRunAt,
      updatedAt: now,
    })
    .where(eq(scheduledJobs.id, job.id));

  schedulerLogger.info(
    { jobId: job.id, nextRunAt },
    'Scheduled job completed, next run time updated'
  );
}

/**
 * Start the scheduler interval
 * Returns a cleanup function to stop the scheduler
 */
export function startScheduler(intervalMs: number = 60000): () => void {
  schedulerLogger.info({ intervalMs }, 'Starting scheduler');

  const intervalId = setInterval(async () => {
    try {
      await processDueScheduledJobs();
    } catch (error) {
      schedulerLogger.error({ error }, 'Scheduler iteration failed');
    }
  }, intervalMs);

  // Run immediately on start
  processDueScheduledJobs().catch((error) => {
    schedulerLogger.error({ error }, 'Initial scheduler run failed');
  });

  return () => {
    clearInterval(intervalId);
    schedulerLogger.info('Scheduler stopped');
  };
}

/**
 * Trigger a scheduled job manually (for testing or on-demand execution)
 */
export async function triggerScheduledJob(jobId: string, appId: string): Promise<boolean> {
  const db = getDatabase();

  const [job] = await db
    .select({
      id: scheduledJobs.id,
      appId: scheduledJobs.appId,
      queueId: scheduledJobs.queueId,
      queueName: queues.name,
      name: scheduledJobs.name,
      cronExpression: scheduledJobs.cronExpression,
      timezone: scheduledJobs.timezone,
      emailTemplate: scheduledJobs.emailTemplate,
    })
    .from(scheduledJobs)
    .innerJoin(queues, eq(scheduledJobs.queueId, queues.id))
    .where(and(eq(scheduledJobs.id, jobId), eq(scheduledJobs.appId, appId)))
    .limit(1);

  if (!job) {
    return false;
  }

  await processScheduledJob(job);
  return true;
}
