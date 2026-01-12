import { index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { apps } from './apps.js';
import { emails } from './emails.js';

// ===========================================
// Suppression Reason Enum
// ===========================================

export const suppressionReasonEnum = pgEnum('suppression_reason', [
  'hard_bounce',
  'soft_bounce',
  'complaint',
  'unsubscribe',
  'manual',
]);

// ===========================================
// Suppression List Table
// ===========================================

export const suppressionList = pgTable(
  'suppression_list',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    appId: uuid('app_id').references(() => apps.id, { onDelete: 'cascade' }), // null = global
    emailAddress: text('email_address').notNull(),
    reason: suppressionReasonEnum('reason').notNull(),
    // onDelete: 'set null' - Preserve suppression entry even if the source email is deleted.
    // The suppression reason remains valid regardless of the original email.
    sourceEmailId: uuid('source_email_id').references(() => emails.id, {
      onDelete: 'set null',
    }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('suppression_list_app_id_email_idx').on(table.appId, table.emailAddress),
    index('suppression_list_email_address_idx').on(table.emailAddress),
    index('suppression_list_expires_at_idx').on(table.expiresAt),
  ]
);

export type SuppressionListRow = typeof suppressionList.$inferSelect;
export type NewSuppressionListRow = typeof suppressionList.$inferInsert;
