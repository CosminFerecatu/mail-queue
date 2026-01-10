import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { apps } from './apps.js';
import { queues } from './queues.js';

// ===========================================
// Scheduled Jobs Table (for recurring emails)
// ===========================================

export const scheduledJobs = pgTable(
  'scheduled_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    appId: uuid('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    queueId: uuid('queue_id')
      .notNull()
      .references(() => queues.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    cronExpression: text('cron_expression').notNull(), // e.g., "0 9 * * MON"
    timezone: text('timezone').notNull().default('UTC'),
    emailTemplate: jsonb('email_template').notNull().$type<{
      from: { email: string; name?: string };
      subject: string;
      html?: string;
      text?: string;
      headers?: Record<string, string>;
    }>(),
    isActive: boolean('is_active').notNull().default(true),
    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
    nextRunAt: timestamp('next_run_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('scheduled_jobs_app_id_idx').on(table.appId),
    index('scheduled_jobs_next_run_at_idx').on(table.nextRunAt),
    index('scheduled_jobs_is_active_idx').on(table.isActive),
  ]
);

export type ScheduledJobRow = typeof scheduledJobs.$inferSelect;
export type NewScheduledJobRow = typeof scheduledJobs.$inferInsert;
