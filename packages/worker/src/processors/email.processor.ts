import type { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { getDatabase, emails, emailEvents, queues, smtpConfigs, apps, appReputation } from '@mail-queue/db';
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

  // Fetch app to check sandbox mode
  const [app] = await db
    .select({ sandboxMode: apps.sandboxMode })
    .from(apps)
    .where(eq(apps.id, appId))
    .limit(1);

  const isSandboxMode = app?.sandboxMode ?? false;

  // Check if app is throttled due to poor reputation
  const [reputation] = await db
    .select({
      isThrottled: appReputation.isThrottled,
      throttleReason: appReputation.throttleReason,
      reputationScore: appReputation.reputationScore,
    })
    .from(appReputation)
    .where(eq(appReputation.appId, appId))
    .limit(1);

  if (reputation?.isThrottled && !isSandboxMode) {
    // App is throttled - delay or reject based on severity
    const score = Number.parseFloat(reputation.reputationScore ?? '100');

    if (score < 20) {
      // Very poor reputation - reject the email
      jobLogger.warn(
        {
          reputationScore: score,
          throttleReason: reputation.throttleReason,
        },
        'Email rejected due to very poor sender reputation'
      );

      await db
        .update(emails)
        .set({
          status: 'failed',
          lastError: `Rejected: ${reputation.throttleReason}`,
        })
        .where(eq(emails.id, emailId));

      await db.insert(emailEvents).values({
        emailId,
        eventType: 'processing',
        eventData: {
          throttled: true,
          reason: reputation.throttleReason ?? undefined,
          reputationScore: score,
        },
        createdAt: new Date(),
      });

      return; // Don't process further
    }

    // Moderate throttling - log warning but continue
    jobLogger.warn(
      {
        reputationScore: score,
        throttleReason: reputation.throttleReason,
      },
      'App is throttled due to reputation, proceeding with caution'
    );
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

    if (smtpConfigRow?.isActive) {
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

    /**
     * Variable replacement with support for:
     * - {{variable}} - simple variable
     * - {{object.property}} - nested object access
     * - {{variable|'default'}} - default value if variable not found
     * - {{object.property|'default'}} - nested with default
     */
    const replaceVars = (text: string): string => {
      // Match {{path}} or {{path|'default'}} or {{path|"default"}}
      return text.replace(
        /\{\{(\w+(?:\.\w+)*)(?:\|['"]([^'"]*)['""])?\}\}/g,
        (match, path: string, defaultValue?: string) => {
          const keys = path.split('.');
          let value: unknown = data;

          for (const key of keys) {
            if (value && typeof value === 'object' && key in value) {
              value = (value as Record<string, unknown>)[key];
            } else {
              // Path not found, use default or keep original
              return defaultValue !== undefined ? defaultValue : match;
            }
          }

          // Return value if found, otherwise default or original
          if (value !== undefined && value !== null) {
            return String(value);
          }
          return defaultValue !== undefined ? defaultValue : match;
        }
      );
    };

    subject = replaceVars(subject);
    if (htmlBody) htmlBody = replaceVars(htmlBody);
    if (textBody) textBody = replaceVars(textBody);
  }

  // 5. Send the email (or simulate in sandbox mode)
  try {
    let result: { messageId: string; accepted: string[]; rejected: string[] };

    if (isSandboxMode) {
      // Sandbox mode: simulate sending without actual SMTP
      const recipients = Array.isArray(email.toAddresses)
        ? email.toAddresses.map((r: { email?: string } | string) =>
            typeof r === 'string' ? r : r.email ?? ''
          )
        : [];

      result = {
        messageId: `sandbox-${emailId}-${Date.now()}@mail-queue.local`,
        accepted: recipients,
        rejected: [],
      };

      jobLogger.info(
        {
          sandboxMode: true,
          to: recipients,
          subject,
        },
        'Email simulated in sandbox mode (not actually sent)'
      );
    } else {
      // Production mode: actually send the email
      result = await sendMail(smtpConfig, {
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
    }

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
        sandboxMode: isSandboxMode,
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
        sandboxMode: isSandboxMode,
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
