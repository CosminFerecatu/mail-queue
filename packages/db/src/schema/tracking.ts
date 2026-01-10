import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { emails } from './emails.js';

// ===========================================
// Tracking Links Table (for click tracking)
// ===========================================

export const trackingLinks = pgTable(
  'tracking_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    emailId: uuid('email_id')
      .notNull()
      .references(() => emails.id, { onDelete: 'cascade' }),
    shortCode: text('short_code').notNull(), // e.g., "abc123xyz"
    originalUrl: text('original_url').notNull(),
    clickCount: integer('click_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('tracking_links_short_code_idx').on(table.shortCode),
    index('tracking_links_email_id_idx').on(table.emailId),
  ]
);

export type TrackingLinkRow = typeof trackingLinks.$inferSelect;
export type NewTrackingLinkRow = typeof trackingLinks.$inferInsert;
