import { z } from 'zod';

// ===========================================
// Queue Models
// ===========================================

export const QueueSettingsSchema = z.object({
  enableOpenTracking: z.boolean().default(true),
  enableClickTracking: z.boolean().default(true),
  addUnsubscribeHeader: z.boolean().default(true),
});

export type QueueSettings = z.infer<typeof QueueSettingsSchema>;

export const QueueSchema = z.object({
  id: z.string().uuid(),
  appId: z.string().uuid(),
  name: z.string().min(1).max(100),
  priority: z.number().int().min(1).max(10).default(5),
  rateLimit: z.number().int().positive().nullable(),
  maxRetries: z.number().int().min(0).max(10).default(5),
  retryDelay: z.array(z.number().int().positive()).default([30, 120, 600, 3600, 86400]),
  smtpConfigId: z.string().uuid().nullable(),
  isPaused: z.boolean().default(false),
  settings: QueueSettingsSchema.nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Queue = z.infer<typeof QueueSchema>;

export const CreateQueueSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Queue name must be lowercase alphanumeric with hyphens only'),
  priority: z.number().int().min(1).max(10).default(5),
  rateLimit: z.number().int().positive().optional(),
  maxRetries: z.number().int().min(0).max(10).default(5),
  retryDelay: z.array(z.number().int().positive()).max(10).optional(),
  smtpConfigId: z.string().uuid().optional(),
  settings: QueueSettingsSchema.partial().optional(),
});

export type CreateQueueInput = z.infer<typeof CreateQueueSchema>;

export const UpdateQueueSchema = CreateQueueSchema.partial().omit({ name: true });

export type UpdateQueueInput = z.infer<typeof UpdateQueueSchema>;

// ===========================================
// Queue Stats
// ===========================================

export const QueueStatsSchema = z.object({
  queueId: z.string().uuid(),
  queueName: z.string(),
  pending: z.number().int(),
  processing: z.number().int(),
  completed: z.number().int(),
  failed: z.number().int(),
  delayed: z.number().int(),
  isPaused: z.boolean(),
  throughput: z.object({
    lastMinute: z.number(),
    lastHour: z.number(),
    lastDay: z.number(),
  }),
});

export type QueueStats = z.infer<typeof QueueStatsSchema>;

// ===========================================
// SMTP Config Models
// ===========================================

export const SmtpEncryptionSchema = z.enum(['tls', 'starttls', 'none']);

export type SmtpEncryption = z.infer<typeof SmtpEncryptionSchema>;

export const SmtpConfigSchema = z.object({
  id: z.string().uuid(),
  appId: z.string().uuid(),
  name: z.string().min(1).max(100),
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535),
  username: z.string().nullable(),
  password: z.string().nullable(), // Encrypted in storage
  encryption: SmtpEncryptionSchema,
  poolSize: z.number().int().min(1).max(50).default(5),
  timeoutMs: z.number().int().min(1000).max(120000).default(30000),
  isActive: z.boolean().default(true),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type SmtpConfig = z.infer<typeof SmtpConfigSchema>;

export const CreateSmtpConfigSchema = z.object({
  name: z.string().min(1).max(100),
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535),
  username: z.string().optional(),
  password: z.string().optional(),
  encryption: SmtpEncryptionSchema.default('tls'),
  poolSize: z.number().int().min(1).max(50).default(5),
  timeoutMs: z.number().int().min(1000).max(120000).default(30000),
});

export type CreateSmtpConfigInput = z.infer<typeof CreateSmtpConfigSchema>;

export const UpdateSmtpConfigSchema = CreateSmtpConfigSchema.partial();

export type UpdateSmtpConfigInput = z.infer<typeof UpdateSmtpConfigSchema>;

export const SmtpConfigResponseSchema = SmtpConfigSchema.omit({ password: true });

export type SmtpConfigResponse = z.infer<typeof SmtpConfigResponseSchema>;
