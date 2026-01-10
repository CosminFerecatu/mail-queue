import type { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { getDatabase, webhookDeliveries } from '@mail-queue/db';
import {
  type DeliverWebhookJobData,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
  WEBHOOK_ID_HEADER,
} from '@mail-queue/core';
import { createHmac } from 'node:crypto';
import { logger } from '../lib/logger.js';

// Retry delays in milliseconds (exponential backoff)
const RETRY_DELAYS = [
  60 * 1000, // 1 minute
  5 * 60 * 1000, // 5 minutes
  30 * 60 * 1000, // 30 minutes
  60 * 60 * 1000, // 1 hour
  4 * 60 * 60 * 1000, // 4 hours
];

const MAX_ATTEMPTS = 5;
const WEBHOOK_TIMEOUT_MS = 30000; // 30 seconds

/**
 * Generate HMAC-SHA256 signature for webhook payload
 */
function generateSignature(secret: string, timestamp: string, payload: string): string {
  const signaturePayload = `${timestamp}.${payload}`;
  return createHmac('sha256', secret).update(signaturePayload).digest('hex');
}

/**
 * Process webhook delivery job
 */
export async function processWebhookJob(job: Job<DeliverWebhookJobData>): Promise<void> {
  const { webhookDeliveryId, appId, webhookUrl, webhookSecret, payload, attempt = 1 } = job.data;
  const jobLogger = logger.child({ jobId: job.id, deliveryId: webhookDeliveryId, appId, attempt });

  jobLogger.info('Processing webhook delivery');

  const db = getDatabase();

  // Verify the delivery record exists
  const [delivery] = await db
    .select()
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.id, webhookDeliveryId))
    .limit(1);

  if (!delivery) {
    jobLogger.error('Webhook delivery record not found');
    throw new Error(`Webhook delivery not found: ${webhookDeliveryId}`);
  }

  // Skip if already delivered
  if (delivery.status === 'delivered') {
    jobLogger.info('Webhook already delivered, skipping');
    return;
  }

  // Prepare the request
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const payloadStr = JSON.stringify(payload);
  const signature = webhookSecret
    ? `sha256=${generateSignature(webhookSecret, timestamp, payloadStr)}`
    : '';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'MailQueue-Webhook/1.0',
    [WEBHOOK_TIMESTAMP_HEADER]: timestamp,
    [WEBHOOK_ID_HEADER]: webhookDeliveryId,
  };

  if (signature) {
    headers[WEBHOOK_SIGNATURE_HEADER] = signature;
  }

  try {
    // Make the HTTP request with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: payloadStr,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Check response status
    if (!response.ok) {
      const responseBody = await response.text().catch(() => 'Unable to read response body');
      throw new Error(`HTTP ${response.status}: ${responseBody.slice(0, 200)}`);
    }

    // Success! Update the delivery record
    const now = new Date();
    await db
      .update(webhookDeliveries)
      .set({
        status: 'delivered',
        attempts: attempt,
        deliveredAt: now,
        lastError: null,
        nextRetryAt: null,
      })
      .where(eq(webhookDeliveries.id, webhookDeliveryId));

    jobLogger.info(
      {
        statusCode: response.status,
        attempts: attempt,
      },
      'Webhook delivered successfully'
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    const displayError = isTimeout ? 'Request timeout' : errorMessage;

    jobLogger.error({ error: displayError, attempt }, 'Webhook delivery failed');

    // Determine if we should retry
    const shouldRetry = attempt < MAX_ATTEMPTS;

    if (shouldRetry) {
      // Calculate next retry time
      const retryDelay =
        RETRY_DELAYS[attempt - 1] ?? RETRY_DELAYS[RETRY_DELAYS.length - 1] ?? 60000;
      const nextRetryAt = new Date(Date.now() + retryDelay);

      await db
        .update(webhookDeliveries)
        .set({
          status: 'pending',
          attempts: attempt,
          lastError: displayError,
          nextRetryAt,
        })
        .where(eq(webhookDeliveries.id, webhookDeliveryId));

      jobLogger.info(
        {
          nextRetryAt: nextRetryAt.toISOString(),
          retryDelay: retryDelay / 1000,
        },
        'Webhook delivery scheduled for retry'
      );

      // Throw to trigger BullMQ retry
      throw new Error(`Webhook delivery failed: ${displayError}`);
    }
    // Max attempts reached - mark as failed
    await db
      .update(webhookDeliveries)
      .set({
        status: 'failed',
        attempts: attempt,
        lastError: displayError,
        nextRetryAt: null,
      })
      .where(eq(webhookDeliveries.id, webhookDeliveryId));

    jobLogger.error(
      { totalAttempts: attempt },
      'Webhook delivery failed permanently after max attempts'
    );
  }
}

/**
 * Verify webhook signature (utility for webhook receivers)
 */
export function verifyWebhookSignature(
  secret: string,
  signature: string,
  timestamp: string,
  payload: string
): boolean {
  if (!signature.startsWith('sha256=')) {
    return false;
  }

  const providedSig = signature.slice(7); // Remove 'sha256=' prefix
  const expectedSig = generateSignature(secret, timestamp, payload);

  // Constant-time comparison to prevent timing attacks
  if (providedSig.length !== expectedSig.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < providedSig.length; i++) {
    result |= providedSig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
  }

  return result === 0;
}
