import {
  index,
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
import { queues } from './queues.js';

// ===========================================
// Email Status Enum
// ===========================================

export const emailStatusEnum = pgEnum('email_status', [
  'queued',
  'processing',
  'sent',
  'delivered',
  'bounced',
  'failed',
  'cancelled',
]);

// ===========================================
// Email Event Type Enum
// ===========================================

export const emailEventTypeEnum = pgEnum('email_event_type', [
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

// ===========================================
// Email Address Type
// ===========================================

export interface EmailAddressJson {
  email: string;
  name?: string;
}

// ===========================================
// Emails Table
// ===========================================

export const emails = pgTable(
  'emails',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    appId: uuid('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    queueId: uuid('queue_id')
      .notNull()
      .references(() => queues.id, { onDelete: 'cascade' }),
    idempotencyKey: text('idempotency_key'),
    messageId: text('message_id'), // SMTP Message-ID
    fromAddress: text('from_address').notNull(),
    fromName: text('from_name'),
    toAddresses: jsonb('to_addresses').notNull().$type<EmailAddressJson[]>(),
    cc: jsonb('cc').$type<EmailAddressJson[]>(),
    bcc: jsonb('bcc').$type<EmailAddressJson[]>(),
    replyTo: text('reply_to'),
    subject: text('subject').notNull(),
    htmlBody: text('html_body'),
    textBody: text('text_body'),
    headers: jsonb('headers').$type<Record<string, string>>(),
    personalizationData: jsonb('personalization_data').$type<Record<string, unknown>>(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    status: emailStatusEnum('status').notNull().default('queued'),
    retryCount: smallint('retry_count').notNull().default(0),
    lastError: text('last_error'),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('emails_app_id_idx').on(table.appId),
    index('emails_queue_id_idx').on(table.queueId),
    index('emails_status_idx').on(table.status),
    index('emails_scheduled_at_idx').on(table.scheduledAt),
    index('emails_message_id_idx').on(table.messageId),
    index('emails_created_at_idx').on(table.createdAt),
    uniqueIndex('emails_app_id_idempotency_key_idx').on(table.appId, table.idempotencyKey),
  ]
);

export type EmailRow = typeof emails.$inferSelect;
export type NewEmailRow = typeof emails.$inferInsert;

// ===========================================
// Email Events Table
// ===========================================

export const emailEvents = pgTable(
  'email_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    emailId: uuid('email_id')
      .notNull()
      .references(() => emails.id, { onDelete: 'cascade' }),
    eventType: emailEventTypeEnum('event_type').notNull(),
    eventData: jsonb('event_data').$type<{
      // Sent event data
      messageId?: string;
      accepted?: string[];
      rejected?: string[];
      // Click/Open tracking data
      linkUrl?: string;
      userAgent?: string;
      ipAddress?: string;
      // Bounce data
      bounceType?: 'hard' | 'soft';
      bounceSubType?: string;
      bounceMessage?: string;
      // Complaint data
      complaintType?: string;
      // Retry/cancel data
      retry?: boolean;
      previousAttempts?: number;
      cancelled?: boolean;
    }>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('email_events_email_id_idx').on(table.emailId),
    index('email_events_email_id_created_at_idx').on(table.emailId, table.createdAt),
    index('email_events_event_type_idx').on(table.eventType),
  ]
);

export type EmailEventRow = typeof emailEvents.$inferSelect;
export type NewEmailEventRow = typeof emailEvents.$inferInsert;
