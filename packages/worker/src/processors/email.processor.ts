import type { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { getDatabase, emails, emailEvents, queues, smtpConfigs } from '@mail-queue/db';
import type { SendEmailJobData } from '@mail-queue/core';
import { parseEncryptionKey, SmtpError } from '@mail-queue/core';
import {
  sendMail,
  smtpConfigFromRow,
  getDefaultSmtpConfig,
  type SmtpClientConfig,
} from '../smtp/client.js';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import {
  recordEmailProcessed,
  startEmailProcessingTimer,
  recordEmailRetry,
  recordSmtpError,
} from '../lib/metrics.js';

const encryptionKey = parseEncryptionKey(config.encryptionKey);

export async function processEmailJob(job: Job<SendEmailJobData>): Promise<void> {
  const { emailId, appId, queueId } = job.data;
  const jobLogger = logger.child({ jobId: job.id, emailId, appId });

  // Start metrics timer
  const stopTimer = startEmailProcessingTimer();
  let queueName = 'unknown';

  jobLogger.info('Processing email job');

  const db = getDatabase();

  // 1. Fetch the email record
  const [email] = await db
    .select()
    .from(emails)
    .where(eq(emails.id, emailId))
    .limit(1);

  if (!email) {
    jobLogger.error('Email not found');
    throw new Error(`Email not found: ${emailId}`);
  }

  // Check if already processed or cancelled
  if (email.status !== 'queued' && email.status !== 'processing') {
    jobLogger.info({ status: email.status }, 'Email already processed, skipping');
    return;
  }

  // 2. Update status to processing
  await db
    .update(emails)
    .set({ status: 'processing' })
    .where(eq(emails.id, emailId));

  await db.insert(emailEvents).values({
    emailId,
    eventType: 'processing',
    createdAt: new Date(),
  });

  // 3. Get SMTP config
  let smtpConfig: SmtpClientConfig | null = null;

  // Check queue for specific SMTP config
  const [queue] = await db
    .select()
    .from(queues)
    .where(eq(queues.id, queueId))
    .limit(1);

  // Capture queue name for metrics
  if (queue) {
    queueName = queue.name;
  }

  if (queue?.smtpConfigId) {
    const [smtpConfigRow] = await db
      .select()
      .from(smtpConfigs)
      .where(eq(smtpConfigs.id, queue.smtpConfigId))
      .limit(1);

    if (smtpConfigRow && smtpConfigRow.isActive) {
      smtpConfig = smtpConfigFromRow(smtpConfigRow, encryptionKey);
    }
  }

  // Fall back to default SMTP config
  if (!smtpConfig) {
    smtpConfig = getDefaultSmtpConfig();
  }

  if (!smtpConfig) {
    const error = 'No SMTP configuration available';
    jobLogger.error(error);

    await db
      .update(emails)
      .set({
        status: 'failed',
        lastError: error,
        retryCount: email.retryCount + 1,
      })
      .where(eq(emails.id, emailId));

    throw new Error(error);
  }

  // 4. Apply personalization if needed
  let subject = email.subject;
  let htmlBody = email.htmlBody;
  let textBody = email.textBody;

  if (email.personalizationData) {
    const data = email.personalizationData as Record<string, unknown>;

    // Simple variable replacement {{variable}}
    const replaceVars = (text: string): string => {
      return text.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, path: string) => {
        const keys = path.split('.');
        let value: unknown = data;

        for (const key of keys) {
          if (value && typeof value === 'object' && key in value) {
            value = (value as Record<string, unknown>)[key];
          } else {
            return match; // Keep original if path not found
          }
        }

        return String(value ?? match);
      });
    };

    subject = replaceVars(subject);
    if (htmlBody) htmlBody = replaceVars(htmlBody);
    if (textBody) textBody = replaceVars(textBody);
  }

  // 5. Send the email
  try {
    const result = await sendMail(smtpConfig, {
      from: {
        email: email.fromAddress,
        name: email.fromName ?? undefined,
      },
      to: email.toAddresses,
      cc: email.cc ?? undefined,
      bcc: email.bcc ?? undefined,
      replyTo: email.replyTo ?? undefined,
      subject,
      html: htmlBody ?? undefined,
      text: textBody ?? undefined,
      headers: email.headers ?? undefined,
    });

    // 6. Update email status to sent
    const now = new Date();
    await db
      .update(emails)
      .set({
        status: 'sent',
        messageId: result.messageId,
        sentAt: now,
      })
      .where(eq(emails.id, emailId));

    await db.insert(emailEvents).values({
      emailId,
      eventType: 'sent',
      eventData: {
        messageId: result.messageId,
        accepted: result.accepted,
        rejected: result.rejected,
      },
      createdAt: now,
    });

    // Record metrics
    stopTimer({ app_id: appId, queue: queueName });
    recordEmailProcessed(appId, queueName, 'sent');

    jobLogger.info(
      {
        messageId: result.messageId,
        accepted: result.accepted.length,
        rejected: result.rejected.length,
      },
      'Email sent successfully'
    );

    // Log rejected recipients if any
    if (result.rejected.length > 0) {
      jobLogger.warn({ rejected: result.rejected }, 'Some recipients were rejected');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    jobLogger.error({ error: errorMessage }, 'Failed to send email');

    // Record metrics
    stopTimer({ app_id: appId, queue: queueName });
    const isFinalAttempt = job.attemptsMade >= (job.opts?.attempts ?? 5) - 1;

    if (isFinalAttempt) {
      recordEmailProcessed(appId, queueName, 'failed');
    } else {
      recordEmailRetry(appId, queueName);
    }

    // Record SMTP error
    recordSmtpError(smtpConfig?.host ?? 'unknown', error instanceof SmtpError ? 'smtp_error' : 'unknown');

    // Update email status
    await db
      .update(emails)
      .set({
        status: isFinalAttempt ? 'failed' : 'queued',
        lastError: errorMessage,
        retryCount: email.retryCount + 1,
      })
      .where(eq(emails.id, emailId));

    // Throw to trigger retry
    throw new SmtpError(errorMessage);
  }
}
