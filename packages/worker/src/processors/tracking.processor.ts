import type { Job } from 'bullmq';
import { eq, sql } from 'drizzle-orm';
import { getDatabase, emails, emailEvents, trackingLinks } from '@mail-queue/db';
import type { RecordTrackingJobData } from '@mail-queue/core';
import { logger } from '../lib/logger.js';

/**
 * Process tracking event job (open or click)
 */
export async function processTrackingJob(job: Job<RecordTrackingJobData>): Promise<void> {
  const { type, emailId, trackingId, linkUrl, userAgent, ipAddress, timestamp } = job.data;
  const jobLogger = logger.child({ jobId: job.id, type, emailId, trackingId });

  jobLogger.info('Processing tracking event');

  const db = getDatabase();

  // Verify email exists and get app ID
  const [email] = await db
    .select({ id: emails.id, appId: emails.appId })
    .from(emails)
    .where(eq(emails.id, emailId))
    .limit(1);

  if (!email) {
    jobLogger.warn('Email not found for tracking event');
    return; // Don't throw - just skip
  }

  const eventTimestamp = new Date(timestamp);

  if (type === 'click') {
    // Update click count on tracking link
    await db
      .update(trackingLinks)
      .set({
        clickCount: sql`${trackingLinks.clickCount} + 1`,
      })
      .where(eq(trackingLinks.shortCode, trackingId));

    // Record click event
    await db.insert(emailEvents).values({
      emailId,
      eventType: 'clicked',
      eventData: {
        linkUrl,
        userAgent,
        ipAddress,
      },
      createdAt: eventTimestamp,
    });

    jobLogger.info(
      {
        appId: email.appId,
        linkUrl,
      },
      'Click event recorded'
    );
  } else if (type === 'open') {
    // Check if we already have an open event for this email
    // (to avoid duplicate counts from image re-loading)
    const [existingOpen] = await db
      .select({ id: emailEvents.id })
      .from(emailEvents)
      .where(eq(emailEvents.emailId, emailId))
      .limit(1);

    // Record open event (allow duplicates for now - could dedupe based on time window)
    await db.insert(emailEvents).values({
      emailId,
      eventType: 'opened',
      eventData: {
        userAgent,
        ipAddress,
      },
      createdAt: eventTimestamp,
    });

    jobLogger.info(
      {
        appId: email.appId,
        isFirstOpen: !existingOpen,
      },
      'Open event recorded'
    );
  }
}

/**
 * Process open tracking event
 */
export async function processOpenTrackingJob(job: Job<RecordTrackingJobData>): Promise<void> {
  return processTrackingJob(job);
}

/**
 * Process click tracking event
 */
export async function processClickTrackingJob(job: Job<RecordTrackingJobData>): Promise<void> {
  return processTrackingJob(job);
}
