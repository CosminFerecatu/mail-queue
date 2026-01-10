import { z } from 'zod';

// ===========================================
// Email Address Models
// ===========================================

export const EmailAddressSchema = z.object({
  email: z.string().email(),
  name: z.string().max(100).optional(),
});

export type EmailAddress = z.infer<typeof EmailAddressSchema>;

// ===========================================
// Email Status
// ===========================================

export const EmailStatusSchema = z.enum([
  'queued',
  'processing',
  'sent',
  'delivered',
  'bounced',
  'failed',
  'cancelled',
]);

export type EmailStatus = z.infer<typeof EmailStatusSchema>;

// ===========================================
// Email Event Types
// ===========================================

export const EmailEventTypeSchema = z.enum([
  'queued',
  'processing',
  'sent',
  'delivered',
  'opened',
  'clicked',
  'bounced',
  'complained',
  'unsubscribed',
]);

export type EmailEventType = z.infer<typeof EmailEventTypeSchema>;

// ===========================================
// Email Models
// ===========================================

export const EmailSchema = z.object({
  id: z.string().uuid(),
  appId: z.string().uuid(),
  queueId: z.string().uuid(),
  idempotencyKey: z.string().max(255).nullable(),
  messageId: z.string().nullable(),
  fromAddress: z.string().email(),
  fromName: z.string().max(100).nullable(),
  toAddresses: z.array(EmailAddressSchema).min(1),
  cc: z.array(EmailAddressSchema).nullable(),
  bcc: z.array(EmailAddressSchema).nullable(),
  replyTo: z.string().email().nullable(),
  subject: z.string().min(1).max(998),
  htmlBody: z.string().nullable(),
  textBody: z.string().nullable(),
  headers: z.record(z.string()).nullable(),
  personalizationData: z.record(z.unknown()).nullable(),
  metadata: z.record(z.unknown()).nullable(),
  status: EmailStatusSchema,
  retryCount: z.number().int().min(0).default(0),
  lastError: z.string().nullable(),
  scheduledAt: z.date().nullable(),
  sentAt: z.date().nullable(),
  deliveredAt: z.date().nullable(),
  createdAt: z.date(),
});

export type Email = z.infer<typeof EmailSchema>;

// ===========================================
// Create Email Input
// ===========================================

export const CreateEmailSchema = z
  .object({
    queue: z.string().min(1).max(100),
    from: EmailAddressSchema,
    to: z.array(EmailAddressSchema).min(1).max(50),
    cc: z.array(EmailAddressSchema).max(50).optional(),
    bcc: z.array(EmailAddressSchema).max(50).optional(),
    replyTo: z.string().email().optional(),
    subject: z.string().min(1).max(998),
    html: z.string().max(5_000_000).optional(), // 5MB max
    text: z.string().max(1_000_000).optional(), // 1MB max
    headers: z.record(z.string()).optional(),
    personalizations: z.record(z.unknown()).optional(),
    metadata: z.record(z.unknown()).optional(),
    scheduledAt: z.string().datetime().optional(),
    idempotencyKey: z.string().max(255).optional(),
  })
  .refine((data) => data.html || data.text, {
    message: 'Either html or text body is required',
  });

export type CreateEmailInput = z.infer<typeof CreateEmailSchema>;

// ===========================================
// Batch Email Input
// ===========================================

export const BatchRecipientSchema = z.object({
  to: z.union([z.string().email(), EmailAddressSchema]),
  cc: z.array(EmailAddressSchema).max(10).optional(),
  bcc: z.array(EmailAddressSchema).max(10).optional(),
  personalizations: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type BatchRecipient = z.infer<typeof BatchRecipientSchema>;

export const CreateBatchEmailSchema = z
  .object({
    queue: z.string().min(1).max(100),
    from: EmailAddressSchema,
    emails: z.array(BatchRecipientSchema).min(1).max(10_000),
    replyTo: z.string().email().optional(),
    subject: z.string().min(1).max(998),
    html: z.string().max(5_000_000).optional(),
    text: z.string().max(1_000_000).optional(),
    headers: z.record(z.string()).optional(),
    scheduledAt: z.string().datetime().optional(),
  })
  .refine((data) => data.html || data.text, {
    message: 'Either html or text body is required',
  });

export type CreateBatchEmailInput = z.infer<typeof CreateBatchEmailSchema>;

// ===========================================
// Email Event Models
// ===========================================

export const EmailEventDataSchema = z.object({
  linkUrl: z.string().url().optional(),
  userAgent: z.string().optional(),
  ipAddress: z.string().optional(),
  bounceType: z.enum(['hard', 'soft']).optional(),
  bounceSubType: z.string().optional(),
  bounceMessage: z.string().optional(),
  complaintType: z.string().optional(),
});

export type EmailEventData = z.infer<typeof EmailEventDataSchema>;

export const EmailEventSchema = z.object({
  id: z.string().uuid(),
  emailId: z.string().uuid(),
  eventType: EmailEventTypeSchema,
  eventData: EmailEventDataSchema.nullable(),
  createdAt: z.date(),
});

export type EmailEvent = z.infer<typeof EmailEventSchema>;

// ===========================================
// Email Response Models
// ===========================================

export const EmailResponseSchema = z.object({
  id: z.string().uuid(),
  queueId: z.string().uuid(),
  queueName: z.string(),
  messageId: z.string().nullable(),
  from: EmailAddressSchema,
  to: z.array(EmailAddressSchema),
  subject: z.string(),
  status: EmailStatusSchema,
  retryCount: z.number(),
  lastError: z.string().nullable(),
  scheduledAt: z.date().nullable(),
  sentAt: z.date().nullable(),
  deliveredAt: z.date().nullable(),
  createdAt: z.date(),
  metadata: z.record(z.unknown()).nullable(),
});

export type EmailResponse = z.infer<typeof EmailResponseSchema>;

export const BatchEmailResponseSchema = z.object({
  batchId: z.string().uuid(),
  totalCount: z.number().int(),
  queuedCount: z.number().int(),
  failedCount: z.number().int(),
  emailIds: z.array(z.string().uuid()),
  errors: z
    .array(
      z.object({
        index: z.number().int(),
        error: z.string(),
      })
    )
    .optional(),
});

export type BatchEmailResponse = z.infer<typeof BatchEmailResponseSchema>;
