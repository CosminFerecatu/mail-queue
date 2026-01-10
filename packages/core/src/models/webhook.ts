import { z } from 'zod';
import { EmailEventTypeSchema } from './email.js';

// ===========================================
// Webhook Event Types
// ===========================================

export const WebhookEventTypeSchema = z.enum([
  'email.queued',
  'email.sent',
  'email.delivered',
  'email.bounced',
  'email.complained',
  'email.opened',
  'email.clicked',
  'email.unsubscribed',
  'email.failed',
]);

export type WebhookEventType = z.infer<typeof WebhookEventTypeSchema>;

// ===========================================
// Webhook Delivery Status
// ===========================================

export const WebhookDeliveryStatusSchema = z.enum(['pending', 'delivered', 'failed']);

export type WebhookDeliveryStatus = z.infer<typeof WebhookDeliveryStatusSchema>;

// ===========================================
// Webhook Delivery Models
// ===========================================

export const WebhookDeliverySchema = z.object({
  id: z.string().uuid(),
  appId: z.string().uuid(),
  emailId: z.string().uuid().nullable(),
  eventType: z.string(),
  payload: z.record(z.unknown()),
  status: WebhookDeliveryStatusSchema,
  attempts: z.number().int().min(0),
  lastError: z.string().nullable(),
  nextRetryAt: z.date().nullable(),
  deliveredAt: z.date().nullable(),
  createdAt: z.date(),
});

export type WebhookDelivery = z.infer<typeof WebhookDeliverySchema>;

// ===========================================
// Webhook Payload
// ===========================================

export const WebhookPayloadSchema = z.object({
  id: z.string().uuid(),
  type: WebhookEventTypeSchema,
  timestamp: z.string().datetime(),
  data: z.object({
    emailId: z.string().uuid(),
    messageId: z.string().nullable(),
    appId: z.string().uuid(),
    queueName: z.string(),
    from: z.string().email(),
    to: z.array(z.string().email()),
    subject: z.string(),
    status: z.string(),
    metadata: z.record(z.unknown()).nullable(),
    event: z
      .object({
        type: EmailEventTypeSchema,
        timestamp: z.string().datetime(),
        data: z.record(z.unknown()).optional(),
      })
      .optional(),
  }),
});

export type WebhookPayload = z.infer<typeof WebhookPayloadSchema>;

// ===========================================
// Webhook Signature Headers
// ===========================================

export const WEBHOOK_SIGNATURE_HEADER = 'x-webhook-signature';
export const WEBHOOK_TIMESTAMP_HEADER = 'x-webhook-timestamp';
export const WEBHOOK_ID_HEADER = 'x-webhook-id';
