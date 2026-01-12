import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { apps } from './apps.js';
import { emails } from './emails.js';

// ===========================================
// Webhook Delivery Status Enum
// ===========================================

export const webhookDeliveryStatusEnum = pgEnum('webhook_delivery_status', [
  'pending',
  'delivered',
  'failed',
]);

// ===========================================
// Webhook Deliveries Table
// ===========================================

export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    appId: uuid('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    // onDelete: 'set null' - Preserve webhook delivery history even if the source email is deleted.
    // This maintains audit trail for webhook deliveries.
    emailId: uuid('email_id').references(() => emails.id, { onDelete: 'set null' }),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').notNull().$type<Record<string, unknown>>(),
    status: webhookDeliveryStatusEnum('status').notNull().default('pending'),
    attempts: smallint('attempts').notNull().default(0),
    lastError: text('last_error'),
    nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('webhook_deliveries_app_id_idx').on(table.appId),
    index('webhook_deliveries_status_idx').on(table.status),
    index('webhook_deliveries_next_retry_at_idx').on(table.nextRetryAt),
  ]
);

export type WebhookDeliveryRow = typeof webhookDeliveries.$inferSelect;
export type NewWebhookDeliveryRow = typeof webhookDeliveries.$inferInsert;
