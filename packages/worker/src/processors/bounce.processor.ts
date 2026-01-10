import type { Job } from 'bullmq';
import { eq, and } from 'drizzle-orm';
import { getDatabase, emails, emailEvents, suppressionList, appReputation } from '@mail-queue/db';
import { logger } from '../lib/logger.js';

const bounceLogger = logger.child({ processor: 'bounce' });

export type BounceType = 'hard' | 'soft';

export interface ProcessBounceJobData {
  emailId: string;
  appId: string;
  bounceType: BounceType;
  bounceSubType?: string;
  bounceMessage?: string;
  bouncedRecipients: string[];
  timestamp: string;
}

export interface ProcessComplaintJobData {
  emailId: string;
  appId: string;
  complaintType?: string;
  complainedRecipients: string[];
  timestamp: string;
}

/**
 * Process a bounce notification
 * - Updates email status to bounced
 * - Records bounce event
 * - Adds hard bounces to suppression list
 */
export async function processBounceJob(job: Job<ProcessBounceJobData>): Promise<void> {
  const { emailId, appId, bounceType, bounceSubType, bounceMessage, bouncedRecipients, timestamp } = job.data;
  const jobLogger = bounceLogger.child({ jobId: job.id, emailId, appId, bounceType });

  jobLogger.info('Processing bounce notification');

  const db = getDatabase();
  const eventTimestamp = new Date(timestamp);

  // Verify email exists
  const [email] = await db
    .select({ id: emails.id, appId: emails.appId })
    .from(emails)
    .where(eq(emails.id, emailId))
    .limit(1);

  if (!email) {
    jobLogger.warn('Email not found for bounce notification');
    return;
  }

  // Update email status to bounced
  await db
    .update(emails)
    .set({ status: 'bounced' })
    .where(eq(emails.id, emailId));

  // Record bounce event
  await db.insert(emailEvents).values({
    emailId,
    eventType: 'bounced',
    eventData: {
      bounceType,
      bounceSubType,
      bounceMessage,
      bouncedRecipients,
    },
    createdAt: eventTimestamp,
  });

  // For hard bounces, add recipients to suppression list
  if (bounceType === 'hard') {
    for (const recipient of bouncedRecipients) {
      const normalizedEmail = recipient.toLowerCase().trim();

      // Check if already in suppression list
      const [existing] = await db
        .select({ id: suppressionList.id })
        .from(suppressionList)
        .where(
          and(
            eq(suppressionList.appId, appId),
            eq(suppressionList.emailAddress, normalizedEmail)
          )
        )
        .limit(1);

      if (!existing) {
        await db.insert(suppressionList).values({
          appId,
          emailAddress: normalizedEmail,
          reason: 'hard_bounce',
          sourceEmailId: emailId,
        });

        jobLogger.info(
          { recipient: normalizedEmail },
          'Added hard bounced email to suppression list'
        );
      }
    }
  } else {
    // For soft bounces, we might add them with an expiration
    // This is optional and depends on business requirements
    for (const recipient of bouncedRecipients) {
      const normalizedEmail = recipient.toLowerCase().trim();

      // Check if already suppressed
      const [existing] = await db
        .select({ id: suppressionList.id })
        .from(suppressionList)
        .where(
          and(
            eq(suppressionList.appId, appId),
            eq(suppressionList.emailAddress, normalizedEmail)
          )
        )
        .limit(1);

      if (!existing) {
        // Add soft bounce with 7-day expiration
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        await db.insert(suppressionList).values({
          appId,
          emailAddress: normalizedEmail,
          reason: 'soft_bounce',
          sourceEmailId: emailId,
          expiresAt,
        });

        jobLogger.info(
          { recipient: normalizedEmail, expiresAt },
          'Added soft bounced email to suppression list (temporary)'
        );
      }
    }
  }

  jobLogger.info(
    {
      bounceType,
      recipientCount: bouncedRecipients.length,
    },
    'Bounce notification processed'
  );
}

/**
 * Process a complaint notification (spam report)
 * - Records complaint event
 * - Adds complainers to suppression list
 */
export async function processComplaintJob(job: Job<ProcessComplaintJobData>): Promise<void> {
  const { emailId, appId, complaintType, complainedRecipients, timestamp } = job.data;
  const jobLogger = bounceLogger.child({ jobId: job.id, emailId, appId });

  jobLogger.info('Processing complaint notification');

  const db = getDatabase();
  const eventTimestamp = new Date(timestamp);

  // Verify email exists
  const [email] = await db
    .select({ id: emails.id, appId: emails.appId })
    .from(emails)
    .where(eq(emails.id, emailId))
    .limit(1);

  if (!email) {
    jobLogger.warn('Email not found for complaint notification');
    return;
  }

  // Record complaint event
  await db.insert(emailEvents).values({
    emailId,
    eventType: 'complained',
    eventData: {
      complaintType,
      complainedRecipients,
    },
    createdAt: eventTimestamp,
  });

  // Add complainers to suppression list (permanent)
  for (const recipient of complainedRecipients) {
    const normalizedEmail = recipient.toLowerCase().trim();

    // Check if already in suppression list
    const [existing] = await db
      .select({ id: suppressionList.id })
      .from(suppressionList)
      .where(
        and(
          eq(suppressionList.appId, appId),
          eq(suppressionList.emailAddress, normalizedEmail)
        )
      )
      .limit(1);

    if (!existing) {
      await db.insert(suppressionList).values({
        appId,
        emailAddress: normalizedEmail,
        reason: 'complaint',
        sourceEmailId: emailId,
      });

      jobLogger.info(
        { recipient: normalizedEmail },
        'Added complained email to suppression list'
      );
    } else {
      // Update existing suppression to complaint (more severe)
      await db
        .update(suppressionList)
        .set({
          reason: 'complaint',
          sourceEmailId: emailId,
          expiresAt: null, // Remove expiration for complaints
        })
        .where(eq(suppressionList.id, existing.id));
    }
  }

  jobLogger.info(
    {
      complaintType,
      recipientCount: complainedRecipients.length,
    },
    'Complaint notification processed'
  );
}

/**
 * Parse a DSN (Delivery Status Notification) message
 * This is a simplified parser - real DSN parsing is more complex
 */
export function parseDsnMessage(rawMessage: string): {
  bounceType: BounceType;
  bounceSubType?: string;
  bounceMessage?: string;
  bouncedRecipients: string[];
} | null {
  try {
    // Common bounce indicators
    const hardBouncePatterns = [
      /user unknown/i,
      /mailbox not found/i,
      /recipient rejected/i,
      /no such user/i,
      /address rejected/i,
      /invalid recipient/i,
      /does not exist/i,
      /550\s+5\.1\.1/i, // User doesn't exist
    ];

    const softBouncePatterns = [
      /mailbox full/i,
      /quota exceeded/i,
      /temporarily/i,
      /try again/i,
      /service unavailable/i,
      /451\s+/i, // Temporary failure
      /452\s+/i, // Insufficient storage
    ];

    let bounceType: BounceType = 'soft';
    let bounceSubType: string | undefined;

    for (const pattern of hardBouncePatterns) {
      if (pattern.test(rawMessage)) {
        bounceType = 'hard';
        bounceSubType = 'permanent_failure';
        break;
      }
    }

    if (bounceType === 'soft') {
      for (const pattern of softBouncePatterns) {
        if (pattern.test(rawMessage)) {
          bounceSubType = 'temporary_failure';
          break;
        }
      }
    }

    // Try to extract email addresses from the message
    const emailRegex = /[\w.+-]+@[\w.-]+\.\w+/gi;
    const bouncedRecipients = [...new Set(rawMessage.match(emailRegex) || [])];

    if (bouncedRecipients.length === 0) {
      return null;
    }

    return {
      bounceType,
      bounceSubType,
      bounceMessage: rawMessage.substring(0, 500), // Truncate long messages
      bouncedRecipients,
    };
  } catch (error) {
    bounceLogger.error({ error }, 'Failed to parse DSN message');
    return null;
  }
}
