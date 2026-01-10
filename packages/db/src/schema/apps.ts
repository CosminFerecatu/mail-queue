import { boolean, index, jsonb, pgTable, text, timestamp, uuid, integer } from 'drizzle-orm/pg-core';

// ===========================================
// Apps Table
// ===========================================

export const apps = pgTable(
  'apps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    description: text('description'),
    isActive: boolean('is_active').notNull().default(true),
    sandboxMode: boolean('sandbox_mode').notNull().default(false),
    webhookUrl: text('webhook_url'),
    webhookSecret: text('webhook_secret'), // Encrypted
    dailyLimit: integer('daily_limit'),
    monthlyLimit: integer('monthly_limit'),
    settings: jsonb('settings').$type<{
      defaultFromEmail?: string;
      defaultFromName?: string;
      maxEmailsPerBatch?: number;
      retentionDays?: number;
    }>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('apps_is_active_idx').on(table.isActive)]
);

export type AppRow = typeof apps.$inferSelect;
export type NewAppRow = typeof apps.$inferInsert;

// ===========================================
// API Keys Table
// ===========================================

export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    appId: uuid('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    keyPrefix: text('key_prefix').notNull(), // e.g., "mq_live_abc1"
    keyHash: text('key_hash').notNull(), // bcrypt hash
    scopes: jsonb('scopes').notNull().$type<string[]>(),
    rateLimit: integer('rate_limit'),
    ipAllowlist: jsonb('ip_allowlist').$type<string[]>(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('api_keys_app_id_idx').on(table.appId),
    index('api_keys_key_hash_idx').on(table.keyHash),
    index('api_keys_is_active_idx').on(table.isActive),
  ]
);

export type ApiKeyRow = typeof apiKeys.$inferSelect;
export type NewApiKeyRow = typeof apiKeys.$inferInsert;
