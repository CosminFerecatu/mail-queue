import { eq, and, desc, lte, lt, or } from 'drizzle-orm';
import { getDatabase, webhookDeliveries, apps, emails, queues } from '@mail-queue/db';
import {
  type WebhookEventType,
  type WebhookDelivery,
  type WebhookPayload,
  type DeliverWebhookJobData,
  QUEUE_NAMES,
  JOB_TYPES,
} from '@mail-queue/core';
import { getQueue } from '../lib/queue.js';
import { logger } from '../lib/logger.js';
import { randomUUID } from 'node:crypto';
import { parseCursor, buildPaginationResult } from '../lib/cursor.js';

// ===========================================
// Types
// ===========================================

export interface CreateWebhookDeliveryOptions {
  appId: string;
  emailId?: string;
  eventType: WebhookEventType;
  eventData?: Record<string, unknown>;
}

export interface WebhookDeliveryListResult {
  deliveries: WebhookDelivery[];
  cursor: string | null;
  hasMore: boolean;
}

// ===========================================
// Create Webhook Delivery
// ===========================================

export async function createWebhookDelivery(
  options: CreateWebhookDeliveryOptions
): Promise<string | null> {
  const { appId, emailId, eventType, eventData } = options;
  const db = getDatabase();

  // Get app configuration
  const [app] = await db
    .select({
      webhookUrl: apps.webhookUrl,
      webhookSecret: apps.webhookSecret,
    })
    .from(apps)
    .where(eq(apps.id, appId))
    .limit(1);

  // If no webhook URL configured, skip
  if (!app?.webhookUrl) {
    logger.debug({ appId, eventType }, 'No webhook URL configured for app');
    return null;
  }

  // Build the webhook payload
  let payload: WebhookPayload;

  if (emailId) {
    // Get email details for the payload
    const [email] = await db
      .select({
        id: emails.id,
        messageId: emails.messageId,
        appId: emails.appId,
        queueName: queues.name,
        fromAddress: emails.fromAddress,
        toAddresses: emails.toAddresses,
        subject: emails.subject,
        status: emails.status,
        metadata: emails.metadata,
      })
      .from(emails)
      .innerJoin(queues, eq(emails.queueId, queues.id))
      .where(eq(emails.id, emailId))
      .limit(1);

    if (!email) {
      logger.warn({ emailId, eventType }, 'Email not found for webhook');
      return null;
    }

    const toAddresses = email.toAddresses as Array<{ email: string }>;

    payload = {
      id: randomUUID(),
      type: eventType,
      timestamp: new Date().toISOString(),
      data: {
        emailId: email.id,
        messageId: email.messageId,
        appId: email.appId,
        queueName: email.queueName,
        from: email.fromAddress,
        to: toAddresses.map((t) => t.email),
        subject: email.subject,
        status: email.status,
        metadata: email.metadata as Record<string, unknown> | null,
        event: eventData
          ? {
              type: eventType.replace('email.', '') as
                | 'queued'
                | 'sent'
                | 'delivered'
                | 'bounced'
                | 'complained'
                | 'opened'
                | 'clicked'
                | 'unsubscribed',
              timestamp: new Date().toISOString(),
              data: eventData,
            }
          : undefined,
      },
    };
  } else {
    // Event without email context (rare)
    payload = {
      id: randomUUID(),
      type: eventType,
      timestamp: new Date().toISOString(),
      data: {
        emailId: '', // Required field but empty
        messageId: null,
        appId,
        queueName: '',
        from: '',
        to: [],
        subject: '',
        status: '',
        metadata: eventData ?? null,
      },
    };
  }

  // Create the webhook delivery record
  const [delivery] = await db
    .insert(webhookDeliveries)
    .values({
      appId,
      emailId: emailId ?? null,
      eventType,
      payload: payload as unknown as Record<string, unknown>,
      status: 'pending',
      attempts: 0,
      createdAt: new Date(),
    })
    .returning({ id: webhookDeliveries.id });

  const deliveryId = delivery?.id ?? randomUUID();

  // Queue the delivery job
  const jobData: DeliverWebhookJobData = {
    webhookDeliveryId: deliveryId,
    appId,
    webhookUrl: app.webhookUrl,
    webhookSecret: app.webhookSecret ?? '',
    payload: payload as unknown as Record<string, unknown>,
    attempt: 1,
  };

  const queue = getQueue(QUEUE_NAMES.WEBHOOK);
  await queue.add(JOB_TYPES.DELIVER_WEBHOOK, jobData, {
    jobId: deliveryId,
  });

  logger.info(
    {
      deliveryId,
      appId,
      eventType,
      emailId,
    },
    'Webhook delivery created and queued'
  );

  return deliveryId;
}

// ===========================================
// Get Webhook Deliveries
// ===========================================

export interface GetWebhookDeliveriesOptions {
  appId: string;
  status?: 'pending' | 'delivered' | 'failed';
  emailId?: string;
  limit?: number;
  cursor?: string;
}

export async function getWebhookDeliveries(
  options: GetWebhookDeliveriesOptions
): Promise<WebhookDeliveryListResult> {
  const { appId, status, emailId, limit = 50, cursor } = options;
  const db = getDatabase();

  const conditions = [eq(webhookDeliveries.appId, appId)];

  if (status) {
    conditions.push(eq(webhookDeliveries.status, status));
  }

  if (emailId) {
    conditions.push(eq(webhookDeliveries.emailId, emailId));
  }

  // Apply cursor-based pagination
  const cursorData = parseCursor(cursor);
  if (cursorData) {
    const cursorDate = new Date(cursorData.c);
    conditions.push(
      or(
        lt(webhookDeliveries.createdAt, cursorDate),
        and(eq(webhookDeliveries.createdAt, cursorDate), lt(webhookDeliveries.id, cursorData.i))
      )!
    );
  }

  const whereClause = and(...conditions);

  // Fetch limit + 1 to determine if there are more results
  const deliveryList = await db
    .select()
    .from(webhookDeliveries)
    .where(whereClause)
    .orderBy(desc(webhookDeliveries.createdAt), desc(webhookDeliveries.id))
    .limit(limit + 1);

  const mappedDeliveries = deliveryList.map((d) => ({
    id: d.id,
    appId: d.appId,
    emailId: d.emailId,
    eventType: d.eventType,
    payload: d.payload,
    status: d.status,
    attempts: d.attempts,
    lastError: d.lastError,
    nextRetryAt: d.nextRetryAt,
    deliveredAt: d.deliveredAt,
    createdAt: d.createdAt,
  }));

  const result = buildPaginationResult(
    mappedDeliveries,
    limit,
    (d) => d.createdAt,
    (d) => d.id
  );

  return {
    deliveries: result.items,
    cursor: result.cursor,
    hasMore: result.hasMore,
  };
}

// ===========================================
// Get Webhook Delivery by ID
// ===========================================

export async function getWebhookDeliveryById(
  deliveryId: string,
  appId: string
): Promise<WebhookDelivery | null> {
  const db = getDatabase();

  const [delivery] = await db
    .select()
    .from(webhookDeliveries)
    .where(and(eq(webhookDeliveries.id, deliveryId), eq(webhookDeliveries.appId, appId)))
    .limit(1);

  if (!delivery) {
    return null;
  }

  return {
    id: delivery.id,
    appId: delivery.appId,
    emailId: delivery.emailId,
    eventType: delivery.eventType,
    payload: delivery.payload,
    status: delivery.status,
    attempts: delivery.attempts,
    lastError: delivery.lastError,
    nextRetryAt: delivery.nextRetryAt,
    deliveredAt: delivery.deliveredAt,
    createdAt: delivery.createdAt,
  };
}

// ===========================================
// Retry Failed Webhook
// ===========================================

export async function retryWebhookDelivery(
  deliveryId: string,
  appId: string
): Promise<{ success: boolean; message: string }> {
  const db = getDatabase();

  // Get the delivery
  const [delivery] = await db
    .select()
    .from(webhookDeliveries)
    .where(and(eq(webhookDeliveries.id, deliveryId), eq(webhookDeliveries.appId, appId)))
    .limit(1);

  if (!delivery) {
    return { success: false, message: 'Webhook delivery not found' };
  }

  if (delivery.status !== 'failed') {
    return { success: false, message: `Cannot retry delivery with status: ${delivery.status}` };
  }

  // Get app webhook config
  const [app] = await db
    .select({
      webhookUrl: apps.webhookUrl,
      webhookSecret: apps.webhookSecret,
    })
    .from(apps)
    .where(eq(apps.id, appId))
    .limit(1);

  if (!app?.webhookUrl) {
    return { success: false, message: 'Webhook URL not configured for app' };
  }

  // Reset status to pending
  await db
    .update(webhookDeliveries)
    .set({
      status: 'pending',
      nextRetryAt: null,
    })
    .where(eq(webhookDeliveries.id, deliveryId));

  // Queue the retry
  const jobData: DeliverWebhookJobData = {
    webhookDeliveryId: deliveryId,
    appId,
    webhookUrl: app.webhookUrl,
    webhookSecret: app.webhookSecret ?? '',
    payload: delivery.payload,
    attempt: delivery.attempts + 1,
  };

  const queue = getQueue(QUEUE_NAMES.WEBHOOK);
  await queue.add(JOB_TYPES.DELIVER_WEBHOOK, jobData, {
    jobId: `${deliveryId}-retry-${delivery.attempts + 1}`,
  });

  logger.info(
    {
      deliveryId,
      appId,
      attempt: delivery.attempts + 1,
    },
    'Webhook delivery retry queued'
  );

  return { success: true, message: 'Webhook delivery retry queued' };
}

// ===========================================
// Process Pending Retries (called by scheduler)
// ===========================================

export async function processPendingRetries(): Promise<number> {
  const db = getDatabase();
  const now = new Date();

  // Find deliveries that need retry
  const pendingRetries = await db
    .select({
      id: webhookDeliveries.id,
      appId: webhookDeliveries.appId,
      payload: webhookDeliveries.payload,
      attempts: webhookDeliveries.attempts,
    })
    .from(webhookDeliveries)
    .innerJoin(apps, eq(webhookDeliveries.appId, apps.id))
    .where(and(eq(webhookDeliveries.status, 'pending'), lte(webhookDeliveries.nextRetryAt, now)))
    .limit(100);

  let queuedCount = 0;

  for (const delivery of pendingRetries) {
    // Get app webhook config
    const [app] = await db
      .select({
        webhookUrl: apps.webhookUrl,
        webhookSecret: apps.webhookSecret,
      })
      .from(apps)
      .where(eq(apps.id, delivery.appId))
      .limit(1);

    if (!app?.webhookUrl) {
      continue;
    }

    const jobData: DeliverWebhookJobData = {
      webhookDeliveryId: delivery.id,
      appId: delivery.appId,
      webhookUrl: app.webhookUrl,
      webhookSecret: app.webhookSecret ?? '',
      payload: delivery.payload,
      attempt: delivery.attempts + 1,
    };

    const queue = getQueue(QUEUE_NAMES.WEBHOOK);
    await queue.add(JOB_TYPES.DELIVER_WEBHOOK, jobData, {
      jobId: `${delivery.id}-retry-${delivery.attempts + 1}`,
    });

    queuedCount++;
  }

  if (queuedCount > 0) {
    logger.info({ count: queuedCount }, 'Pending webhook retries queued');
  }

  return queuedCount;
}

// ===========================================
// Queue Email Event Webhook (convenience)
// ===========================================

export async function queueEmailEventWebhook(
  emailId: string,
  appId: string,
  eventType: WebhookEventType,
  eventData?: Record<string, unknown>
): Promise<void> {
  await createWebhookDelivery({
    appId,
    emailId,
    eventType,
    eventData,
  });
}
