import { boolean, decimal, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { apps } from './apps.js';

// ===========================================
// App Reputation Table (for throttling decisions)
// ===========================================

export const appReputation = pgTable(
  'app_reputation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    appId: uuid('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    bounceRate24h: decimal('bounce_rate_24h', { precision: 5, scale: 2 }), // 0.00 - 100.00
    complaintRate24h: decimal('complaint_rate_24h', { precision: 5, scale: 2 }),
    reputationScore: decimal('reputation_score', { precision: 5, scale: 2 }), // 0.00 - 100.00
    isThrottled: boolean('is_throttled').notNull().default(false),
    throttleReason: text('throttle_reason'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('app_reputation_app_id_idx').on(table.appId)]
);

export type AppReputationRow = typeof appReputation.$inferSelect;
export type NewAppReputationRow = typeof appReputation.$inferInsert;
