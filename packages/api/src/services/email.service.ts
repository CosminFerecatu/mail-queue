import { eq, and, desc, sql } from 'drizzle-orm';
import { getDatabase, emails, queues, emailEvents, suppressionList } from '@mail-queue/db';
import {
  type CreateEmailInput,
  type CreateBatchEmailInput,
  type BatchEmailResponse,
  type EmailResponse,
  type EmailEvent,
  type SendEmailJobData,
  ValidationError,
  QueueNotFoundError,
  EmailNotFoundError,
  SuppressedEmailError,
  IdempotencyConflictError,
  QueuePausedError,
  validateEmail,
  validateHtml,
} from '@mail-queue/core';
import { addEmailJob, addDelayedEmailJob } from '../lib/queue.js';
import { logger } from '../lib/logger.js';
import { recordEmailQueued } from '../lib/metrics.js';
import { randomUUID } from 'node:crypto';

export interface CreateEmailOptions {
  appId: string;
  input: CreateEmailInput;
  idempotencyKey?: string;
}

export interface CreateEmailResult {
  id: string;
  status: string;
  queuedAt: Date;
}

export async function createEmail(options: CreateEmailOptions): Promise<CreateEmailResult> {
  const { appId, input, idempotencyKey } = options;
  const db = getDatabase();

  // 1. Validate email addresses
  const validationErrors: Array<{ path: string; message: string }> = [];

  const fromValidation = validateEmail(input.from.email);
  if (!fromValidation.isValid) {
    validationErrors.push({ path: 'from.email', message: fromValidation.errors.join(', ') });
  }

  for (let i = 0; i < input.to.length; i++) {
    const toValidation = validateEmail(input.to[i]?.email);
    if (!toValidation.isValid) {
      validationErrors.push({ path: `to[${i}].email`, message: toValidation.errors.join(', ') });
    }
  }

  if (validationErrors.length > 0) {
    throw new ValidationError(validationErrors);
  }

  // 2. Validate HTML content if provided
  if (input.html) {
    const htmlValidation = validateHtml(input.html, input.text ?? null);
    if (!htmlValidation.isValid) {
      throw new ValidationError(
        htmlValidation.errors.map((e) => ({ path: 'html', message: e }))
      );
    }
  }

  // 3. Find the queue
  const [queue] = await db
    .select()
    .from(queues)
    .where(and(eq(queues.appId, appId), eq(queues.name, input.queue)))
    .limit(1);

  if (!queue) {
    throw new QueueNotFoundError(input.queue);
  }

  if (queue.isPaused) {
    throw new QueuePausedError(input.queue);
  }

  // 4. Check idempotency
  if (idempotencyKey) {
    const [existingEmail] = await db
      .select({ id: emails.id })
      .from(emails)
      .where(and(eq(emails.appId, appId), eq(emails.idempotencyKey, idempotencyKey)))
      .limit(1);

    if (existingEmail) {
      throw new IdempotencyConflictError(idempotencyKey, existingEmail.id);
    }
  }

  // 5. Check suppression list for all recipients
  const allRecipients = [
    ...input.to.map((t) => t.email),
    ...(input.cc?.map((c) => c.email) ?? []),
    ...(input.bcc?.map((b) => b.email) ?? []),
  ];

  for (const recipientEmail of allRecipients) {
    const [suppressed] = await db
      .select()
      .from(suppressionList)
      .where(
        and(
          eq(suppressionList.emailAddress, recipientEmail.toLowerCase()),
          // Check app-specific or global suppression
        )
      )
      .limit(1);

    if (suppressed) {
      throw new SuppressedEmailError(recipientEmail, suppressed.reason);
    }
  }

  // 6. Create the email record
  const emailId = randomUUID();
  const now = new Date();
  const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;

  const [createdEmail] = await db
    .insert(emails)
    .values({
      id: emailId,
      appId,
      queueId: queue.id,
      idempotencyKey: idempotencyKey ?? null,
      fromAddress: input.from.email,
      fromName: input.from.name ?? null,
      toAddresses: input.to,
      cc: input.cc ?? null,
      bcc: input.bcc ?? null,
      replyTo: input.replyTo ?? null,
      subject: input.subject,
      htmlBody: input.html ?? null,
      textBody: input.text ?? null,
      headers: input.headers ?? null,
      personalizationData: input.personalizations ?? null,
      metadata: input.metadata ?? null,
      status: 'queued',
      scheduledAt,
      createdAt: now,
    })
    .returning({ id: emails.id, status: emails.status, createdAt: emails.createdAt });

  // 7. Record queued event
  await db.insert(emailEvents).values({
    emailId,
    eventType: 'queued',
    createdAt: now,
  });

  // 8. Add to BullMQ queue
  const jobData: SendEmailJobData = {
    emailId,
    appId,
    queueId: queue.id,
    priority: queue.priority,
  };

  if (scheduledAt && scheduledAt > now) {
    const delayMs = scheduledAt.getTime() - now.getTime();
    await addDelayedEmailJob(jobData, delayMs);
  } else {
    await addEmailJob(jobData);
  }

  // Record metric
  recordEmailQueued(appId, queue.name);

  logger.info(
    {
      emailId,
      appId,
      queueId: queue.id,
      queueName: queue.name,
      toCount: input.to.length,
      scheduled: !!scheduledAt,
    },
    'Email queued'
  );

  return {
    id: createdEmail?.id,
    status: createdEmail?.status,
    queuedAt: createdEmail?.createdAt,
  };
}

export async function getEmailById(emailId: string, appId: string): Promise<EmailResponse> {
  const db = getDatabase();

  const [email] = await db
    .select({
      id: emails.id,
      queueId: emails.queueId,
      queueName: queues.name,
      messageId: emails.messageId,
      fromAddress: emails.fromAddress,
      fromName: emails.fromName,
      toAddresses: emails.toAddresses,
      subject: emails.subject,
      status: emails.status,
      retryCount: emails.retryCount,
      lastError: emails.lastError,
      scheduledAt: emails.scheduledAt,
      sentAt: emails.sentAt,
      deliveredAt: emails.deliveredAt,
      createdAt: emails.createdAt,
      metadata: emails.metadata,
    })
    .from(emails)
    .innerJoin(queues, eq(emails.queueId, queues.id))
    .where(and(eq(emails.id, emailId), eq(emails.appId, appId)))
    .limit(1);

  if (!email) {
    throw new EmailNotFoundError(emailId);
  }

  return {
    id: email.id,
    queueId: email.queueId,
    queueName: email.queueName,
    messageId: email.messageId,
    from: {
      email: email.fromAddress,
      name: email.fromName ?? undefined,
    },
    to: email.toAddresses,
    subject: email.subject,
    status: email.status,
    retryCount: email.retryCount,
    lastError: email.lastError,
    scheduledAt: email.scheduledAt,
    sentAt: email.sentAt,
    deliveredAt: email.deliveredAt,
    createdAt: email.createdAt,
    metadata: email.metadata,
  };
}

export async function getEmailEvents(emailId: string, appId: string): Promise<EmailEvent[]> {
  const db = getDatabase();

  // First verify the email belongs to the app
  const [email] = await db
    .select({ id: emails.id })
    .from(emails)
    .where(and(eq(emails.id, emailId), eq(emails.appId, appId)))
    .limit(1);

  if (!email) {
    throw new EmailNotFoundError(emailId);
  }

  const events = await db
    .select()
    .from(emailEvents)
    .where(eq(emailEvents.emailId, emailId))
    .orderBy(desc(emailEvents.createdAt));

  return events.map((e) => ({
    id: e.id,
    emailId: e.emailId,
    eventType: e.eventType,
    eventData: e.eventData,
    createdAt: e.createdAt,
  }));
}

export async function cancelScheduledEmail(emailId: string, appId: string): Promise<void> {
  const db = getDatabase();

  const [email] = await db
    .select()
    .from(emails)
    .where(and(eq(emails.id, emailId), eq(emails.appId, appId)))
    .limit(1);

  if (!email) {
    throw new EmailNotFoundError(emailId);
  }

  if (email.status !== 'queued') {
    throw new ValidationError([
      { path: 'status', message: `Cannot cancel email with status: ${email.status}` },
    ]);
  }

  // Update status to cancelled
  await db
    .update(emails)
    .set({ status: 'cancelled' })
    .where(eq(emails.id, emailId));

  // Record event
  await db.insert(emailEvents).values({
    emailId,
    eventType: 'processing', // Using processing as closest to "cancelled"
    eventData: { cancelled: true },
    createdAt: new Date(),
  });

  logger.info({ emailId, appId }, 'Email cancelled');
}

export type EmailStatus = 'queued' | 'processing' | 'sent' | 'delivered' | 'bounced' | 'failed' | 'cancelled';

interface GetEmailsOptions {
  limit?: number;
  offset?: number;
  status?: EmailStatus;
  queueId?: string;
}

export async function getEmailsByAppId(
  appId: string,
  options: GetEmailsOptions = {}
): Promise<{ emails: EmailResponse[]; total: number }> {
  const db = getDatabase();
  const { limit = 50, offset = 0, status, queueId } = options;

  const conditions = [eq(emails.appId, appId)];

  if (status) {
    conditions.push(eq(emails.status, status));
  }

  if (queueId) {
    conditions.push(eq(emails.queueId, queueId));
  }

  const whereClause = and(...conditions);

  const [emailList, countResult] = await Promise.all([
    db
      .select({
        id: emails.id,
        queueId: emails.queueId,
        queueName: queues.name,
        messageId: emails.messageId,
        fromAddress: emails.fromAddress,
        fromName: emails.fromName,
        toAddresses: emails.toAddresses,
        subject: emails.subject,
        status: emails.status,
        retryCount: emails.retryCount,
        lastError: emails.lastError,
        scheduledAt: emails.scheduledAt,
        sentAt: emails.sentAt,
        deliveredAt: emails.deliveredAt,
        createdAt: emails.createdAt,
        metadata: emails.metadata,
      })
      .from(emails)
      .innerJoin(queues, eq(emails.queueId, queues.id))
      .where(whereClause)
      .orderBy(desc(emails.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(emails)
      .where(whereClause),
  ]);

  return {
    emails: emailList.map((email) => ({
      id: email.id,
      queueId: email.queueId,
      queueName: email.queueName,
      messageId: email.messageId,
      from: {
        email: email.fromAddress,
        name: email.fromName ?? undefined,
      },
      to: email.toAddresses,
      subject: email.subject,
      status: email.status,
      retryCount: email.retryCount,
      lastError: email.lastError,
      scheduledAt: email.scheduledAt,
      sentAt: email.sentAt,
      deliveredAt: email.deliveredAt,
      createdAt: email.createdAt,
      metadata: email.metadata,
    })),
    total: countResult[0]?.count ?? 0,
  };
}

export async function retryFailedEmail(
  emailId: string,
  appId: string
): Promise<{ id: string; status: string; message: string }> {
  const db = getDatabase();

  const [email] = await db
    .select()
    .from(emails)
    .where(and(eq(emails.id, emailId), eq(emails.appId, appId)))
    .limit(1);

  if (!email) {
    throw new EmailNotFoundError(emailId);
  }

  if (email.status !== 'failed') {
    throw new ValidationError([
      { path: 'status', message: `Cannot retry email with status: ${email.status}` },
    ]);
  }

  // Reset status to queued
  const now = new Date();
  await db
    .update(emails)
    .set({
      status: 'queued',
      lastError: null,
    })
    .where(eq(emails.id, emailId));

  // Record retry event
  await db.insert(emailEvents).values({
    emailId,
    eventType: 'queued',
    eventData: { retry: true, previousAttempts: email.retryCount },
    createdAt: now,
  });

  // Re-queue the job
  const jobData: SendEmailJobData = {
    emailId,
    appId,
    queueId: email.queueId,
    priority: 5, // Default priority for retries
  };

  await addEmailJob(jobData);

  logger.info({ emailId, appId, previousAttempts: email.retryCount }, 'Email retry queued');

  return {
    id: emailId,
    status: 'queued',
    message: 'Email has been re-queued for retry',
  };
}

// ===========================================
// Batch Email Functions
// ===========================================

export interface CreateBatchEmailOptions {
  appId: string;
  input: CreateBatchEmailInput;
}

export async function createBatchEmails(options: CreateBatchEmailOptions): Promise<BatchEmailResponse> {
  const { appId, input } = options;
  const db = getDatabase();
  const batchId = randomUUID();

  // 1. Validate from address
  const fromValidation = validateEmail(input.from.email);
  if (!fromValidation.isValid) {
    throw new ValidationError([{ path: 'from.email', message: fromValidation.errors.join(', ') }]);
  }

  // 2. Validate HTML content if provided
  if (input.html) {
    const htmlValidation = validateHtml(input.html, input.text ?? null);
    if (!htmlValidation.isValid) {
      throw new ValidationError(
        htmlValidation.errors.map((e) => ({ path: 'html', message: e }))
      );
    }
  }

  // 3. Find the queue
  const [queue] = await db
    .select()
    .from(queues)
    .where(and(eq(queues.appId, appId), eq(queues.name, input.queue)))
    .limit(1);

  if (!queue) {
    throw new QueueNotFoundError(input.queue);
  }

  if (queue.isPaused) {
    throw new QueuePausedError(input.queue);
  }

  const now = new Date();
  const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
  const emailIds: string[] = [];
  const errors: Array<{ index: number; error: string }> = [];

  // 4. Process each recipient
  for (let i = 0; i < input.emails.length; i++) {
    const recipient = input.emails[i]!;

    try {
      // Extract recipient email
      const toEmail = typeof recipient.to === 'string'
        ? { email: recipient.to }
        : recipient.to;

      // Validate recipient email
      const toValidation = validateEmail(toEmail.email);
      if (!toValidation.isValid) {
        errors.push({ index: i, error: `Invalid email: ${toValidation.errors.join(', ')}` });
        continue;
      }

      // Check suppression list
      const [suppressed] = await db
        .select()
        .from(suppressionList)
        .where(eq(suppressionList.emailAddress, toEmail.email.toLowerCase()))
        .limit(1);

      if (suppressed) {
        errors.push({ index: i, error: `Email suppressed: ${suppressed.reason}` });
        continue;
      }

      // Create email record
      const emailId = randomUUID();
      const toAddresses = [toEmail];

      // Merge batch-level and recipient-level personalizations
      const personalizations = {
        ...(recipient.personalizations ?? {}),
      };

      const metadata = {
        batchId,
        batchIndex: i,
        ...(recipient.metadata ?? {}),
      };

      await db.insert(emails).values({
        id: emailId,
        appId,
        queueId: queue.id,
        fromAddress: input.from.email,
        fromName: input.from.name ?? null,
        toAddresses,
        cc: recipient.cc ?? null,
        bcc: recipient.bcc ?? null,
        replyTo: input.replyTo ?? null,
        subject: input.subject,
        htmlBody: input.html ?? null,
        textBody: input.text ?? null,
        headers: input.headers ?? null,
        personalizationData: personalizations,
        metadata,
        status: 'queued',
        scheduledAt,
        createdAt: now,
      });

      // Record queued event
      await db.insert(emailEvents).values({
        emailId,
        eventType: 'queued',
        eventData: { batchId, batchIndex: i },
        createdAt: now,
      });

      // Add to BullMQ queue
      const jobData: SendEmailJobData = {
        emailId,
        appId,
        queueId: queue.id,
        priority: queue.priority,
      };

      if (scheduledAt && scheduledAt > now) {
        const delayMs = scheduledAt.getTime() - now.getTime();
        await addDelayedEmailJob(jobData, delayMs);
      } else {
        await addEmailJob(jobData);
      }

      emailIds.push(emailId);
      recordEmailQueued(appId, queue.name);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push({ index: i, error: errorMessage });
    }
  }

  logger.info(
    {
      batchId,
      appId,
      queueId: queue.id,
      queueName: queue.name,
      totalCount: input.emails.length,
      queuedCount: emailIds.length,
      failedCount: errors.length,
    },
    'Batch emails queued'
  );

  return {
    batchId,
    totalCount: input.emails.length,
    queuedCount: emailIds.length,
    failedCount: errors.length,
    emailIds,
    errors: errors.length > 0 ? errors : undefined,
  };
}
