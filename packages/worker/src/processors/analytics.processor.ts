import type { Job } from 'bullmq';
import { eq, and, gte, lte, sql, count } from 'drizzle-orm';
import { getDatabase, emails, emailEvents, appReputation, apps } from '@mail-queue/db';
import type { AggregateStatsJobData, UpdateReputationJobData } from '@mail-queue/core';
import { logger } from '../lib/logger.js';

/**
 * Process analytics aggregation job
 * This job computes and caches aggregate statistics for faster dashboard queries
 */
export async function processAggregateStatsJob(job: Job<AggregateStatsJobData>): Promise<void> {
  const { appId, period, timestamp } = job.data;
  const jobLogger = logger.child({ jobId: job.id, appId, period, timestamp });

  jobLogger.info('Processing analytics aggregation');

  const db = getDatabase();
  const baseTime = new Date(timestamp);

  // Calculate time range based on period
  let from: Date;
  let to: Date;

  if (period === 'hourly') {
    // Aggregate for the previous hour
    to = new Date(baseTime);
    to.setMinutes(0, 0, 0);
    from = new Date(to.getTime() - 60 * 60 * 1000);
  } else {
    // Aggregate for the previous day
    to = new Date(baseTime);
    to.setHours(0, 0, 0, 0);
    from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
  }

  // If appId is specified, aggregate for that app only
  // Otherwise, aggregate for all apps
  if (appId) {
    await aggregateForApp(appId, from, to, period, jobLogger);
  } else {
    // Get all active apps
    const activeApps = await db.select({ id: apps.id }).from(apps).where(eq(apps.isActive, true));

    for (const app of activeApps) {
      await aggregateForApp(app.id, from, to, period, jobLogger);
    }
  }

  jobLogger.info('Analytics aggregation completed');
}

async function aggregateForApp(
  appId: string,
  from: Date,
  to: Date,
  period: string,
  jobLogger: typeof logger
): Promise<void> {
  const db = getDatabase();

  // Get email counts by status
  const statusCounts = await db
    .select({
      status: emails.status,
      count: count(),
    })
    .from(emails)
    .where(and(eq(emails.appId, appId), gte(emails.createdAt, from), lte(emails.createdAt, to)))
    .groupBy(emails.status);

  // Get event counts
  const eventCounts = await db
    .select({
      eventType: emailEvents.eventType,
      count: count(),
    })
    .from(emailEvents)
    .innerJoin(emails, eq(emailEvents.emailId, emails.id))
    .where(
      and(eq(emails.appId, appId), gte(emailEvents.createdAt, from), lte(emailEvents.createdAt, to))
    )
    .groupBy(emailEvents.eventType);

  // Log aggregated stats
  const stats = {
    appId,
    period,
    from: from.toISOString(),
    to: to.toISOString(),
    emailsByStatus: Object.fromEntries(statusCounts.map((s) => [s.status, s.count])),
    eventsByType: Object.fromEntries(eventCounts.map((e) => [e.eventType, e.count])),
  };

  jobLogger.info(stats, 'App statistics aggregated');

  // In a production system, you might store these aggregated stats in a separate table
  // for faster queries. For now, we just log them.
}

/**
 * Process reputation update job
 * Calculates and updates app reputation scores based on bounce/complaint rates
 */
export async function processReputationUpdateJob(job: Job<UpdateReputationJobData>): Promise<void> {
  const { appId } = job.data;
  const jobLogger = logger.child({ jobId: job.id, appId });

  jobLogger.info('Processing reputation update');

  const db = getDatabase();

  // Calculate 24-hour metrics
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Get sent count in last 24h (sent, delivered, or bounced status)
  const [sentResult] = await db
    .select({ count: count() })
    .from(emails)
    .where(
      and(
        eq(emails.appId, appId),
        gte(emails.createdAt, yesterday),
        sql`${emails.status} IN ('sent', 'delivered', 'bounced')`
      )
    );

  const sentCount = sentResult?.count ?? 0;

  // Get bounce count in last 24h
  const [bounceResult] = await db
    .select({ count: count() })
    .from(emails)
    .where(
      and(eq(emails.appId, appId), eq(emails.status, 'bounced'), gte(emails.createdAt, yesterday))
    );

  const bounceCount = bounceResult?.count ?? 0;

  // Get complaint count in last 24h
  const [complaintResult] = await db
    .select({ count: count() })
    .from(emailEvents)
    .innerJoin(emails, eq(emailEvents.emailId, emails.id))
    .where(
      and(
        eq(emails.appId, appId),
        eq(emailEvents.eventType, 'complained'),
        gte(emailEvents.createdAt, yesterday)
      )
    );

  const complaintCount = complaintResult?.count ?? 0;

  // Calculate rates
  const bounceRate = sentCount > 0 ? (bounceCount / sentCount) * 100 : 0;
  const complaintRate = sentCount > 0 ? (complaintCount / sentCount) * 100 : 0;

  // Calculate reputation score
  // Base score of 100, subtract based on bounce and complaint rates
  let score = 100;
  score -= bounceRate * 2; // Each 1% bounce = -2 points
  score -= complaintRate * 20; // Each 1% complaint = -20 points
  score = Math.max(0, Math.min(100, score));

  // Determine throttling
  const isThrottled = bounceRate > 10 || complaintRate > 1;
  let throttleReason: string | null = null;

  if (bounceRate > 10) {
    throttleReason = `High bounce rate: ${bounceRate.toFixed(2)}%`;
  } else if (complaintRate > 1) {
    throttleReason = `High complaint rate: ${complaintRate.toFixed(2)}%`;
  }

  // Upsert reputation record
  await db
    .insert(appReputation)
    .values({
      appId,
      bounceRate24h: bounceRate.toFixed(2),
      complaintRate24h: complaintRate.toFixed(2),
      reputationScore: score.toFixed(2),
      isThrottled,
      throttleReason,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [appReputation.appId],
      set: {
        bounceRate24h: bounceRate.toFixed(2),
        complaintRate24h: complaintRate.toFixed(2),
        reputationScore: score.toFixed(2),
        isThrottled,
        throttleReason,
        updatedAt: now,
      },
    });

  jobLogger.info(
    {
      sentCount,
      bounceCount,
      complaintCount,
      bounceRate: bounceRate.toFixed(2),
      complaintRate: complaintRate.toFixed(2),
      score: score.toFixed(2),
      isThrottled,
    },
    'Reputation updated'
  );
}

/**
 * Process all apps reputation update
 * Called periodically to update reputation for all active apps
 */
export async function processAllAppsReputationUpdate(): Promise<number> {
  const db = getDatabase();

  // Get all active apps
  const activeApps = await db.select({ id: apps.id }).from(apps).where(eq(apps.isActive, true));

  let updatedCount = 0;

  for (const app of activeApps) {
    try {
      await processReputationUpdateJob({
        data: { appId: app.id },
        attemptsMade: 0,
      } as unknown as Job<UpdateReputationJobData>);
      updatedCount++;
    } catch (error) {
      logger.error({ appId: app.id, error }, 'Failed to update app reputation');
    }
  }

  logger.info(
    { updatedCount, totalApps: activeApps.length },
    'All apps reputation update completed'
  );

  return updatedCount;
}
