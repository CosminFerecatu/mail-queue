import type { Job } from 'bullmq';
import { eq, sql, and } from 'drizzle-orm';
import { getDatabase, emails, emailEvents, trackingLinks } from '@mail-queue/db';
import type { RecordTrackingJobData } from '@mail-queue/core';
import { logger } from '../lib/logger.js';
import { config } from '../config.js';
import { anonymizeIpAddress } from '../lib/privacy.js';

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

  // Anonymize IP address for GDPR compliance if enabled
  const processedIpAddress = config.anonymizeIpAddresses
    ? (anonymizeIpAddress(ipAddress) ?? undefined)
    : ipAddress;

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
        ipAddress: processedIpAddress,
      },
      createdAt: eventTimestamp,
    });

    jobLogger.info({ appId: email.appId, linkUrl }, 'Click event recorded');
  } else if (type === 'open') {
    // Check if this is the first open event for this email
    const [existingOpen] = await db
      .select({ id: emailEvents.id })
      .from(emailEvents)
      .where(and(eq(emailEvents.emailId, emailId), eq(emailEvents.eventType, 'opened')))
      .limit(1);

    const isFirstOpen = !existingOpen;

    // Record open event
    await db.insert(emailEvents).values({
      emailId,
      eventType: 'opened',
      eventData: {
        userAgent,
        ipAddress: processedIpAddress,
      },
      createdAt: eventTimestamp,
    });

    jobLogger.info({ appId: email.appId, isFirstOpen }, 'Open event recorded');
  }
}
