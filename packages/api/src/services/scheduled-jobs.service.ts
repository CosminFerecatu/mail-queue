import { eq, and, desc, lte, lt, or } from 'drizzle-orm';
import { getDatabase, scheduledJobs, queues } from '@mail-queue/db';
import { ValidationError, QueueNotFoundError } from '@mail-queue/core';
import { logger } from '../lib/logger.js';
import cronParser from 'cron-parser';
import { parseCursor, buildPaginationResult } from '../lib/cursor.js';

export interface EmailTemplate {
  from: { email: string; name?: string };
  subject: string;
  html?: string;
  text?: string;
  headers?: Record<string, string>;
}

export interface ScheduledJob {
  id: string;
  appId: string;
  queueId: string;
  queueName?: string;
  name: string;
  cronExpression: string;
  timezone: string;
  emailTemplate: EmailTemplate;
  isActive: boolean;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateScheduledJobInput {
  queueName: string;
  name: string;
  cronExpression: string;
  timezone?: string;
  emailTemplate: EmailTemplate;
}

export interface UpdateScheduledJobInput {
  name?: string;
  cronExpression?: string;
  timezone?: string;
  emailTemplate?: EmailTemplate;
  isActive?: boolean;
}

export interface ListScheduledJobsOptions {
  limit?: number;
  cursor?: string;
  isActive?: boolean;
}

export interface ScheduledJobListResult {
  jobs: ScheduledJob[];
  cursor: string | null;
  hasMore: boolean;
}

/**
 * Calculate the next run time from a cron expression
 */
function calculateNextRunTime(cronExpression: string, timezone: string): Date | null {
  try {
    const interval = cronParser.parseExpression(cronExpression, {
      currentDate: new Date(),
      tz: timezone,
    });
    return interval.next().toDate();
  } catch (error) {
    logger.error({ cronExpression, timezone, error }, 'Failed to parse cron expression');
    return null;
  }
}

/**
 * Validate a cron expression
 */
export function validateCronExpression(cronExpression: string, timezone = 'UTC'): boolean {
  try {
    cronParser.parseExpression(cronExpression, { tz: timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a scheduled job
 */
export async function createScheduledJob(
  appId: string,
  input: CreateScheduledJobInput
): Promise<ScheduledJob> {
  const db = getDatabase();

  // Validate cron expression
  if (!validateCronExpression(input.cronExpression, input.timezone ?? 'UTC')) {
    throw new ValidationError([{ path: 'cronExpression', message: 'Invalid cron expression' }]);
  }

  // Find the queue
  const [queue] = await db
    .select()
    .from(queues)
    .where(and(eq(queues.appId, appId), eq(queues.name, input.queueName)))
    .limit(1);

  if (!queue) {
    throw new QueueNotFoundError(input.queueName);
  }

  // Calculate next run time
  const timezone = input.timezone ?? 'UTC';
  const nextRunAt = calculateNextRunTime(input.cronExpression, timezone);

  // Create the job
  const now = new Date();
  const [created] = await db
    .insert(scheduledJobs)
    .values({
      appId,
      queueId: queue.id,
      name: input.name,
      cronExpression: input.cronExpression,
      timezone,
      emailTemplate: input.emailTemplate,
      isActive: true,
      nextRunAt,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  logger.info(
    { jobId: created?.id, appId, queueId: queue.id, name: input.name },
    'Scheduled job created'
  );

  return {
    id: created?.id ?? '',
    appId: created?.appId ?? appId,
    queueId: created?.queueId ?? queue.id,
    queueName: queue.name,
    name: created?.name ?? input.name,
    cronExpression: created?.cronExpression ?? input.cronExpression,
    timezone: created?.timezone ?? timezone,
    emailTemplate: (created?.emailTemplate as EmailTemplate) ?? input.emailTemplate,
    isActive: created?.isActive ?? true,
    lastRunAt: created?.lastRunAt ?? null,
    nextRunAt: created?.nextRunAt ?? nextRunAt,
    createdAt: created?.createdAt ?? now,
    updatedAt: created?.updatedAt ?? now,
  };
}

/**
 * Get a scheduled job by ID
 */
export async function getScheduledJobById(
  jobId: string,
  appId: string
): Promise<ScheduledJob | null> {
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
      isActive: scheduledJobs.isActive,
      lastRunAt: scheduledJobs.lastRunAt,
      nextRunAt: scheduledJobs.nextRunAt,
      createdAt: scheduledJobs.createdAt,
      updatedAt: scheduledJobs.updatedAt,
    })
    .from(scheduledJobs)
    .innerJoin(queues, eq(scheduledJobs.queueId, queues.id))
    .where(and(eq(scheduledJobs.id, jobId), eq(scheduledJobs.appId, appId)))
    .limit(1);

  if (!job) {
    return null;
  }

  return {
    ...job,
    emailTemplate: job.emailTemplate as EmailTemplate,
  };
}

/**
 * List scheduled jobs for an app
 */
export async function listScheduledJobs(
  appId: string,
  options: ListScheduledJobsOptions = {}
): Promise<ScheduledJobListResult> {
  const db = getDatabase();
  const { limit = 50, cursor, isActive } = options;

  const conditions = [eq(scheduledJobs.appId, appId)];

  if (isActive !== undefined) {
    conditions.push(eq(scheduledJobs.isActive, isActive));
  }

  // Apply cursor-based pagination
  const cursorData = parseCursor(cursor);
  if (cursorData) {
    const cursorDate = new Date(cursorData.c);
    conditions.push(
      or(
        lt(scheduledJobs.createdAt, cursorDate),
        and(eq(scheduledJobs.createdAt, cursorDate), lt(scheduledJobs.id, cursorData.i))
      )!
    );
  }

  const whereClause = and(...conditions);

  // Fetch limit + 1 to determine if there are more results
  const jobsList = await db
    .select({
      id: scheduledJobs.id,
      appId: scheduledJobs.appId,
      queueId: scheduledJobs.queueId,
      queueName: queues.name,
      name: scheduledJobs.name,
      cronExpression: scheduledJobs.cronExpression,
      timezone: scheduledJobs.timezone,
      emailTemplate: scheduledJobs.emailTemplate,
      isActive: scheduledJobs.isActive,
      lastRunAt: scheduledJobs.lastRunAt,
      nextRunAt: scheduledJobs.nextRunAt,
      createdAt: scheduledJobs.createdAt,
      updatedAt: scheduledJobs.updatedAt,
    })
    .from(scheduledJobs)
    .innerJoin(queues, eq(scheduledJobs.queueId, queues.id))
    .where(whereClause)
    .orderBy(desc(scheduledJobs.createdAt), desc(scheduledJobs.id))
    .limit(limit + 1);

  const mappedJobs = jobsList.map((job) => ({
    ...job,
    emailTemplate: job.emailTemplate as EmailTemplate,
  }));

  const result = buildPaginationResult(
    mappedJobs,
    limit,
    (j) => j.createdAt,
    (j) => j.id
  );

  return {
    jobs: result.items,
    cursor: result.cursor,
    hasMore: result.hasMore,
  };
}

/**
 * Update a scheduled job
 */
export async function updateScheduledJob(
  jobId: string,
  appId: string,
  input: UpdateScheduledJobInput
): Promise<ScheduledJob | null> {
  const db = getDatabase();

  // Get existing job
  const existing = await getScheduledJobById(jobId, appId);
  if (!existing) {
    return null;
  }

  // Validate cron expression if provided
  const cronExpression = input.cronExpression ?? existing.cronExpression;
  const timezone = input.timezone ?? existing.timezone;

  if (input.cronExpression && !validateCronExpression(input.cronExpression, timezone)) {
    throw new ValidationError([{ path: 'cronExpression', message: 'Invalid cron expression' }]);
  }

  // Calculate new next run time if cron or timezone changed
  let nextRunAt = existing.nextRunAt;
  if (input.cronExpression || input.timezone) {
    nextRunAt = calculateNextRunTime(cronExpression, timezone);
  }

  const now = new Date();
  const [_updated] = await db
    .update(scheduledJobs)
    .set({
      ...(input.name && { name: input.name }),
      ...(input.cronExpression && { cronExpression: input.cronExpression }),
      ...(input.timezone && { timezone: input.timezone }),
      ...(input.emailTemplate && { emailTemplate: input.emailTemplate }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
      nextRunAt,
      updatedAt: now,
    })
    .where(and(eq(scheduledJobs.id, jobId), eq(scheduledJobs.appId, appId)))
    .returning();

  logger.info({ jobId, appId }, 'Scheduled job updated');

  return getScheduledJobById(jobId, appId);
}

/**
 * Delete a scheduled job
 */
export async function deleteScheduledJob(jobId: string, appId: string): Promise<boolean> {
  const db = getDatabase();

  const result = await db
    .delete(scheduledJobs)
    .where(and(eq(scheduledJobs.id, jobId), eq(scheduledJobs.appId, appId)))
    .returning({ id: scheduledJobs.id });

  if (result.length > 0) {
    logger.info({ jobId, appId }, 'Scheduled job deleted');
    return true;
  }

  return false;
}

/**
 * Get scheduled jobs that are due to run
 */
export async function getDueScheduledJobs(): Promise<ScheduledJob[]> {
  const db = getDatabase();
  const now = new Date();

  const jobs = await db
    .select({
      id: scheduledJobs.id,
      appId: scheduledJobs.appId,
      queueId: scheduledJobs.queueId,
      queueName: queues.name,
      name: scheduledJobs.name,
      cronExpression: scheduledJobs.cronExpression,
      timezone: scheduledJobs.timezone,
      emailTemplate: scheduledJobs.emailTemplate,
      isActive: scheduledJobs.isActive,
      lastRunAt: scheduledJobs.lastRunAt,
      nextRunAt: scheduledJobs.nextRunAt,
      createdAt: scheduledJobs.createdAt,
      updatedAt: scheduledJobs.updatedAt,
    })
    .from(scheduledJobs)
    .innerJoin(queues, eq(scheduledJobs.queueId, queues.id))
    .where(and(eq(scheduledJobs.isActive, true), lte(scheduledJobs.nextRunAt, now)));

  return jobs.map((job) => ({
    ...job,
    emailTemplate: job.emailTemplate as EmailTemplate,
  }));
}

/**
 * Mark a scheduled job as run and calculate next run time
 */
export async function markScheduledJobRun(jobId: string): Promise<void> {
  const db = getDatabase();
  const now = new Date();

  // Get the job to calculate next run time
  const [job] = await db.select().from(scheduledJobs).where(eq(scheduledJobs.id, jobId)).limit(1);

  if (!job) {
    return;
  }

  const nextRunAt = calculateNextRunTime(job.cronExpression, job.timezone);

  await db
    .update(scheduledJobs)
    .set({
      lastRunAt: now,
      nextRunAt,
      updatedAt: now,
    })
    .where(eq(scheduledJobs.id, jobId));

  logger.info({ jobId, nextRunAt }, 'Scheduled job marked as run');
}
