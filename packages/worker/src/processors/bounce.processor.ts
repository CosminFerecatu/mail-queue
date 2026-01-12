import type { Job } from 'bullmq';
import { eq, and } from 'drizzle-orm';
import { getDatabase, emails, emailEvents, suppressionList } from '@mail-queue/db';
import { logger } from '../lib/logger.js';
import { SOFT_BOUNCE_EXPIRATION_DAYS } from '../constants.js';

const bounceLogger = logger.child({ processor: 'bounce' });

export type BounceType = 'hard' | 'soft';
export type SuppressionReason = 'hard_bounce' | 'soft_bounce' | 'complaint';

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
 * Add recipients to the suppression list
 * Handles both new insertions and updates for existing entries
 */
async function addToSuppressionList(
  appId: string,
  emailId: string,
  recipients: string[],
  reason: SuppressionReason,
  jobLogger: typeof bounceLogger,
  expiresAt?: Date
): Promise<void> {
  const db = getDatabase();

  for (const recipient of recipients) {
    const normalizedEmail = recipient.toLowerCase().trim();

    // Check if already in suppression list
    const [existing] = await db
      .select({ id: suppressionList.id, reason: suppressionList.reason })
      .from(suppressionList)
      .where(
        and(eq(suppressionList.appId, appId), eq(suppressionList.emailAddress, normalizedEmail))
      )
      .limit(1);

    if (!existing) {
      // Insert new suppression entry
      await db.insert(suppressionList).values({
        appId,
        emailAddress: normalizedEmail,
        reason,
        sourceEmailId: emailId,
        expiresAt,
      });

      const logMessage = expiresAt
        ? `Added ${reason} email to suppression list (expires: ${expiresAt.toISOString()})`
        : `Added ${reason} email to suppression list`;

      jobLogger.info({ recipient: normalizedEmail, expiresAt }, logMessage);
    } else if (reason === 'complaint') {
      // Complaints are more severe - upgrade existing suppression
      await db
        .update(suppressionList)
        .set({
          reason: 'complaint',
          sourceEmailId: emailId,
          expiresAt: null, // Remove expiration for complaints
        })
        .where(eq(suppressionList.id, existing.id));

      jobLogger.info(
        { recipient: normalizedEmail, previousReason: existing.reason },
        'Upgraded suppression to complaint'
      );
    }
    // For bounces, if already suppressed, keep existing entry
  }
}

/**
 * Process a bounce notification
 * - Updates email status to bounced
 * - Records bounce event
 * - Adds bounced recipients to suppression list
 */
export async function processBounceJob(job: Job<ProcessBounceJobData>): Promise<void> {
  const { emailId, appId, bounceType, bounceSubType, bounceMessage, bouncedRecipients, timestamp } =
    job.data;
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
  await db.update(emails).set({ status: 'bounced' }).where(eq(emails.id, emailId));

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

  // Add recipients to suppression list
  if (bounceType === 'hard') {
    await addToSuppressionList(appId, emailId, bouncedRecipients, 'hard_bounce', jobLogger);
  } else {
    // Soft bounces get temporary suppression
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + SOFT_BOUNCE_EXPIRATION_DAYS);
    await addToSuppressionList(
      appId,
      emailId,
      bouncedRecipients,
      'soft_bounce',
      jobLogger,
      expiresAt
    );
  }

  jobLogger.info(
    { bounceType, recipientCount: bouncedRecipients.length },
    'Bounce notification processed'
  );
}

/**
 * Process a complaint notification (spam report)
 * - Records complaint event
 * - Adds complainers to suppression list (permanent)
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

  // Add complainers to suppression list (permanent, will upgrade existing entries)
  await addToSuppressionList(appId, emailId, complainedRecipients, 'complaint', jobLogger);

  jobLogger.info(
    { complaintType, recipientCount: complainedRecipients.length },
    'Complaint notification processed'
  );
}

// Maximum size for DSN message processing to prevent ReDoS and memory issues
const MAX_DSN_MESSAGE_LENGTH = 50000; // 50KB
const MAX_BOUNCE_RECIPIENTS = 100;

/**
 * Parse a DSN (Delivery Status Notification) message
 * This is a simplified parser - real DSN parsing is more complex
 *
 * Security: Input is truncated to prevent ReDoS attacks and memory exhaustion
 */
export function parseDsnMessage(rawMessage: string): {
  bounceType: BounceType;
  bounceSubType?: string;
  bounceMessage?: string;
  bouncedRecipients: string[];
} | null {
  try {
    if (!rawMessage || rawMessage.length === 0) {
      return null;
    }

    const truncatedMessage =
      rawMessage.length > MAX_DSN_MESSAGE_LENGTH
        ? rawMessage.substring(0, MAX_DSN_MESSAGE_LENGTH)
        : rawMessage;

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
      if (pattern.test(truncatedMessage)) {
        bounceType = 'hard';
        bounceSubType = 'permanent_failure';
        break;
      }
    }

    if (bounceType === 'soft') {
      for (const pattern of softBouncePatterns) {
        if (pattern.test(truncatedMessage)) {
          bounceSubType = 'temporary_failure';
          break;
        }
      }
    }

    // Try to extract email addresses from the message
    const emailRegex = /[\w.+-]+@[\w.-]+\.\w+/gi;
    const allMatches = truncatedMessage.match(emailRegex) || [];
    const uniqueRecipients = [...new Set(allMatches)];
    const bouncedRecipients = uniqueRecipients.slice(0, MAX_BOUNCE_RECIPIENTS);

    if (bouncedRecipients.length === 0) {
      return null;
    }

    return {
      bounceType,
      bounceSubType,
      bounceMessage: truncatedMessage.substring(0, 500), // Truncate for storage
      bouncedRecipients,
    };
  } catch (error) {
    bounceLogger.error({ error }, 'Failed to parse DSN message');
    return null;
  }
}
