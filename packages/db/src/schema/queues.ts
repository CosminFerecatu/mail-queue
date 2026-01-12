import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { apps } from './apps.js';

// ===========================================
// SMTP Encryption Enum
// ===========================================

export const smtpEncryptionEnum = pgEnum('smtp_encryption', ['tls', 'starttls', 'none']);

// ===========================================
// SMTP Configs Table
// ===========================================

export const smtpConfigs = pgTable(
  'smtp_configs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    appId: uuid('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    host: text('host').notNull(),
    port: integer('port').notNull(),
    username: text('username'),
    password: text('password'), // Encrypted with AES-256-GCM
    encryption: smtpEncryptionEnum('encryption').notNull().default('tls'),
    poolSize: integer('pool_size').notNull().default(5),
    timeoutMs: integer('timeout_ms').notNull().default(30000),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('smtp_configs_app_id_idx').on(table.appId)]
);

export type SmtpConfigRow = typeof smtpConfigs.$inferSelect;
export type NewSmtpConfigRow = typeof smtpConfigs.$inferInsert;

// ===========================================
// Queues Table
// ===========================================

export const queues = pgTable(
  'queues',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    appId: uuid('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    priority: smallint('priority').notNull().default(5),
    rateLimit: integer('rate_limit'), // emails per minute
    maxRetries: smallint('max_retries').notNull().default(5),
    retryDelay: jsonb('retry_delay').$type<number[]>().default([30, 120, 600, 3600, 86400]),
    // onDelete: 'set null' - Preserve queue configuration if SMTP config is deleted.
    // Queue can be reassigned to a different SMTP config later.
    smtpConfigId: uuid('smtp_config_id').references(() => smtpConfigs.id, {
      onDelete: 'set null',
    }),
    isPaused: boolean('is_paused').notNull().default(false),
    settings: jsonb('settings').$type<{
      enableOpenTracking?: boolean;
      enableClickTracking?: boolean;
      addUnsubscribeHeader?: boolean;
    }>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('queues_app_id_idx').on(table.appId),
    uniqueIndex('queues_app_id_name_idx').on(table.appId, table.name),
  ]
);

export type QueueRow = typeof queues.$inferSelect;
export type NewQueueRow = typeof queues.$inferInsert;
