import { z } from 'zod';

// ===========================================
// App Models
// ===========================================

export const AppSettingsSchema = z.object({
  defaultFromEmail: z.string().email().optional(),
  defaultFromName: z.string().max(100).optional(),
  maxEmailsPerBatch: z.number().int().positive().max(10000).default(1000),
  retentionDays: z.number().int().positive().max(365).default(90),
});

export type AppSettings = z.infer<typeof AppSettingsSchema>;

export const AppSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).nullable(),
  isActive: z.boolean().default(true),
  sandboxMode: z.boolean().default(false),
  webhookUrl: z.string().url().nullable(),
  webhookSecret: z.string().nullable(),
  dailyLimit: z.number().int().positive().nullable(),
  monthlyLimit: z.number().int().positive().nullable(),
  settings: AppSettingsSchema.nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type App = z.infer<typeof AppSchema>;

export const CreateAppSchema = AppSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  webhookSecret: true,
}).partial({
  isActive: true,
  sandboxMode: true,
  description: true,
  webhookUrl: true,
  dailyLimit: true,
  monthlyLimit: true,
  settings: true,
});

export type CreateAppInput = z.infer<typeof CreateAppSchema>;

export const UpdateAppSchema = CreateAppSchema.partial();

export type UpdateAppInput = z.infer<typeof UpdateAppSchema>;

// ===========================================
// API Key Models
// ===========================================

export const ApiKeyScopeSchema = z.enum([
  'email:send',
  'email:read',
  'queue:manage',
  'smtp:manage',
  'analytics:read',
  'suppression:manage',
  'admin',
]);

export type ApiKeyScope = z.infer<typeof ApiKeyScopeSchema>;

export const ApiKeySchema = z.object({
  id: z.string().uuid(),
  appId: z.string().uuid(),
  name: z.string().min(1).max(100),
  keyPrefix: z.string().max(12),
  keyHash: z.string(),
  scopes: z.array(ApiKeyScopeSchema),
  rateLimit: z.number().int().positive().nullable(),
  ipAllowlist: z.array(z.string()).nullable(),
  lastUsedAt: z.date().nullable(),
  expiresAt: z.date().nullable(),
  isActive: z.boolean().default(true),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type ApiKey = z.infer<typeof ApiKeySchema>;

export const CreateApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(ApiKeyScopeSchema).min(1),
  rateLimit: z.number().int().positive().optional(),
  ipAllowlist: z.array(z.string()).optional(),
  expiresAt: z.date().optional(),
});

export type CreateApiKeyInput = z.infer<typeof CreateApiKeySchema>;

export const ApiKeyResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  keyPrefix: z.string(),
  scopes: z.array(ApiKeyScopeSchema),
  rateLimit: z.number().nullable(),
  ipAllowlist: z.array(z.string()).nullable(),
  expiresAt: z.date().nullable(),
  isActive: z.boolean(),
  createdAt: z.date(),
  lastUsedAt: z.date().nullable(),
});

export type ApiKeyResponse = z.infer<typeof ApiKeyResponseSchema>;

export const ApiKeyWithSecretSchema = ApiKeyResponseSchema.extend({
  key: z.string(), // Full key, only returned once at creation
});

export type ApiKeyWithSecret = z.infer<typeof ApiKeyWithSecretSchema>;
