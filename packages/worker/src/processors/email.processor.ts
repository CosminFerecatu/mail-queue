import type { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import {
  getDatabase,
  emails,
  emailEvents,
  queues,
  smtpConfigs,
  apps,
  appReputation,
} from '@mail-queue/db';
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
import { sanitizeErrorMessage } from '../lib/privacy.js';
import { REPUTATION_SCORE_CRITICAL_THRESHOLD } from '../constants.js';

const encryptionKey = parseEncryptionKey(config.encryptionKey);

// Types for internal use
interface EmailRecord {
  id: string;
  appId: string;
  status: string;
  subject: string;
  htmlBody: string | null;
  textBody: string | null;
  fromAddress: string;
  fromName: string | null;
  toAddresses: unknown;
  cc: unknown;
  bcc: unknown;
  replyTo: string | null;
  headers: unknown;
  personalizationData: unknown;
  retryCount: number;
}

interface ThrottleCheckResult {
  shouldReject: boolean;
  shouldWarn: boolean;
  reason: string | null;
  score: number;
}

interface SendResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
}

/**
 * Load and validate email record
 * Returns null if email should be skipped (not found or already processed)
 */
async function loadAndValidateEmail(
  emailId: string,
  jobLogger: typeof logger
): Promise<EmailRecord | null> {
  const db = getDatabase();

  const [email] = await db.select().from(emails).where(eq(emails.id, emailId)).limit(1);

  if (!email) {
    jobLogger.error('Email not found');
    throw new Error(`Email not found: ${emailId}`);
  }

  // Check if already processed or cancelled
  if (email.status !== 'queued' && email.status !== 'processing') {
    jobLogger.info({ status: email.status }, 'Email already processed, skipping');
    return null;
  }

  return email as EmailRecord;
}

/**
 * Check if app is in sandbox mode
 */
async function checkSandboxMode(appId: string): Promise<boolean> {
  const db = getDatabase();

  const [app] = await db
    .select({ sandboxMode: apps.sandboxMode })
    .from(apps)
    .where(eq(apps.id, appId))
    .limit(1);

  return app?.sandboxMode ?? false;
}

/**
 * Check app throttling based on reputation
 */
async function checkAppThrottling(appId: string): Promise<ThrottleCheckResult> {
  const db = getDatabase();

  const [reputation] = await db
    .select({
      isThrottled: appReputation.isThrottled,
      throttleReason: appReputation.throttleReason,
      reputationScore: appReputation.reputationScore,
    })
    .from(appReputation)
    .where(eq(appReputation.appId, appId))
    .limit(1);

  if (!reputation?.isThrottled) {
    return { shouldReject: false, shouldWarn: false, reason: null, score: 100 };
  }

  const score = Number.parseFloat(reputation.reputationScore ?? '100');

  return {
    shouldReject: score < REPUTATION_SCORE_CRITICAL_THRESHOLD,
    shouldWarn: score >= REPUTATION_SCORE_CRITICAL_THRESHOLD,
    reason: reputation.throttleReason,
    score,
  };
}

/**
 * Update email status to processing and record event
 */
async function updateStatusToProcessing(emailId: string): Promise<void> {
  const db = getDatabase();

  await db.update(emails).set({ status: 'processing' }).where(eq(emails.id, emailId));

  await db.insert(emailEvents).values({
    emailId,
    eventType: 'processing',
    createdAt: new Date(),
  });
}

/**
 * Resolve SMTP config from queue or use default
 */
async function resolveSmtpConfig(
  queueId: string,
  _jobLogger: typeof logger
): Promise<{ smtpConfig: SmtpClientConfig | null; queueName: string }> {
  const db = getDatabase();
  let queueName = 'unknown';

  const [queue] = await db.select().from(queues).where(eq(queues.id, queueId)).limit(1);

  if (queue) {
    queueName = queue.name;
  }

  // Check queue for specific SMTP config
  if (queue?.smtpConfigId) {
    const [smtpConfigRow] = await db
      .select()
      .from(smtpConfigs)
      .where(eq(smtpConfigs.id, queue.smtpConfigId))
      .limit(1);

    if (smtpConfigRow?.isActive) {
      return {
        smtpConfig: smtpConfigFromRow(smtpConfigRow, encryptionKey),
        queueName,
      };
    }
  }

  // Fall back to default SMTP config
  return { smtpConfig: getDefaultSmtpConfig(), queueName };
}

/**
 * Apply personalization variables to email content
 */
function applyPersonalization(
  subject: string,
  htmlBody: string | null,
  textBody: string | null,
  personalizationData: unknown
): { subject: string; htmlBody: string | null; textBody: string | null } {
  if (!personalizationData) {
    return { subject, htmlBody, textBody };
  }

  const data = personalizationData as Record<string, unknown>;

  /**
   * Variable replacement with support for:
   * - {{variable}} - simple variable
   * - {{object.property}} - nested object access
   * - {{variable|'default'}} - default value if variable not found
   */
  const replaceVars = (text: string): string => {
    return text.replace(
      /\{\{(\w+(?:\.\w+)*)(?:\|['"]([^'"]*)['""])?\}\}/g,
      (match, path: string, defaultValue?: string) => {
        const keys = path.split('.');
        let value: unknown = data;

        for (const key of keys) {
          if (value && typeof value === 'object' && key in value) {
            value = (value as Record<string, unknown>)[key];
          } else {
            return defaultValue !== undefined ? defaultValue : match;
          }
        }

        if (value !== undefined && value !== null) {
          return String(value);
        }
        return defaultValue !== undefined ? defaultValue : match;
      }
    );
  };

  return {
    subject: replaceVars(subject),
    htmlBody: htmlBody ? replaceVars(htmlBody) : null,
    textBody: textBody ? replaceVars(textBody) : null,
  };
}

/**
 * Send email in sandbox mode (simulate without actual SMTP)
 */
function simulateSandboxSend(
  email: EmailRecord,
  emailId: string,
  jobLogger: typeof logger
): SendResult {
  const recipients = Array.isArray(email.toAddresses)
    ? (email.toAddresses as Array<{ email?: string } | string>).map((r) =>
        typeof r === 'string' ? r : (r.email ?? '')
      )
    : [];

  jobLogger.info(
    { sandboxMode: true, to: recipients, subject: email.subject },
    'Email simulated in sandbox mode (not actually sent)'
  );

  return {
    messageId: `sandbox-${emailId}-${Date.now()}@mail-queue.local`,
    accepted: recipients,
    rejected: [],
  };
}

/**
 * Record successful email send
 */
async function recordEmailSuccess(
  emailId: string,
  result: SendResult,
  appId: string,
  queueName: string,
  isSandboxMode: boolean,
  stopTimer: (labels: { app_id: string; queue: string }) => void,
  jobLogger: typeof logger
): Promise<void> {
  const db = getDatabase();
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

  if (result.rejected.length > 0) {
    jobLogger.warn({ rejected: result.rejected }, 'Some recipients were rejected');
  }
}

/**
 * Record email failure and handle retry logic
 */
async function recordEmailFailure(
  emailId: string,
  error: Error,
  job: Job<SendEmailJobData>,
  email: EmailRecord,
  appId: string,
  queueName: string,
  smtpHost: string,
  stopTimer: (labels: { app_id: string; queue: string }) => void,
  jobLogger: typeof logger
): Promise<void> {
  const db = getDatabase();
  const errorMessage = error.message;

  jobLogger.error({ error: errorMessage }, 'Failed to send email');

  stopTimer({ app_id: appId, queue: queueName });
  const isFinalAttempt = job.attemptsMade >= (job.opts?.attempts ?? 5) - 1;

  if (isFinalAttempt) {
    recordEmailProcessed(appId, queueName, 'failed');
  } else {
    recordEmailRetry(appId, queueName);
  }

  recordSmtpError(smtpHost, error instanceof SmtpError ? 'smtp_error' : 'unknown');

  const sanitizedError = sanitizeErrorMessage(errorMessage);

  await db
    .update(emails)
    .set({
      status: isFinalAttempt ? 'failed' : 'queued',
      lastError: sanitizedError,
      retryCount: email.retryCount + 1,
    })
    .where(eq(emails.id, emailId));
}

/**
 * Handle throttled email rejection
 */
async function rejectThrottledEmail(
  emailId: string,
  throttleResult: ThrottleCheckResult,
  jobLogger: typeof logger
): Promise<void> {
  const db = getDatabase();

  jobLogger.warn(
    { reputationScore: throttleResult.score, throttleReason: throttleResult.reason },
    'Email rejected due to very poor sender reputation'
  );

  await db
    .update(emails)
    .set({
      status: 'failed',
      lastError: `Rejected: ${throttleResult.reason}`,
    })
    .where(eq(emails.id, emailId));

  await db.insert(emailEvents).values({
    emailId,
    eventType: 'processing',
    eventData: {
      throttled: true,
      reason: throttleResult.reason ?? undefined,
      reputationScore: throttleResult.score,
    },
    createdAt: new Date(),
  });
}

/**
 * Main email job processor
 * Orchestrates the email sending workflow
 */
export async function processEmailJob(job: Job<SendEmailJobData>): Promise<void> {
  const { emailId, appId, queueId } = job.data;
  const jobLogger = logger.child({ jobId: job.id, emailId, appId });
  const stopTimer = startEmailProcessingTimer();

  jobLogger.info('Processing email job');

  // 1. Load and validate email
  const email = await loadAndValidateEmail(emailId, jobLogger);
  if (!email) return;

  // 2. Check sandbox mode and throttling
  const isSandboxMode = await checkSandboxMode(appId);
  const throttleResult = await checkAppThrottling(appId);

  if (throttleResult.shouldReject && !isSandboxMode) {
    await rejectThrottledEmail(emailId, throttleResult, jobLogger);
    return;
  }

  if (throttleResult.shouldWarn && !isSandboxMode) {
    jobLogger.warn(
      { reputationScore: throttleResult.score, throttleReason: throttleResult.reason },
      'App is throttled due to reputation, proceeding with caution'
    );
  }

  // 3. Update status to processing
  await updateStatusToProcessing(emailId);

  // 4. Resolve SMTP config
  const { smtpConfig, queueName } = await resolveSmtpConfig(queueId, jobLogger);

  if (!smtpConfig) {
    const error = 'No SMTP configuration available';
    jobLogger.error(error);

    const db = getDatabase();
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

  // 5. Apply personalization
  const { subject, htmlBody, textBody } = applyPersonalization(
    email.subject,
    email.htmlBody,
    email.textBody,
    email.personalizationData
  );

  // 6. Send the email
  try {
    let result: SendResult;

    if (isSandboxMode) {
      result = simulateSandboxSend(email, emailId, jobLogger);
    } else {
      result = await sendMail(smtpConfig, {
        from: { email: email.fromAddress, name: email.fromName ?? undefined },
        to: email.toAddresses as Array<{ email: string; name?: string }>,
        cc: (email.cc as Array<{ email: string; name?: string }>) ?? undefined,
        bcc: (email.bcc as Array<{ email: string; name?: string }>) ?? undefined,
        replyTo: email.replyTo ?? undefined,
        subject,
        html: htmlBody ?? undefined,
        text: textBody ?? undefined,
        headers: (email.headers as Record<string, string>) ?? undefined,
      });
    }

    await recordEmailSuccess(
      emailId,
      result,
      appId,
      queueName,
      isSandboxMode,
      stopTimer,
      jobLogger
    );
  } catch (error) {
    await recordEmailFailure(
      emailId,
      error instanceof Error ? error : new Error(String(error)),
      job,
      email,
      appId,
      queueName,
      smtpConfig.host,
      stopTimer,
      jobLogger
    );

    throw new SmtpError(error instanceof Error ? error.message : String(error));
  }
}
