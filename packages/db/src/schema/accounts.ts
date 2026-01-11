import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  integer,
  uuid,
} from 'drizzle-orm/pg-core';

// ===========================================
// Subscription Plan Enum
// ===========================================

export const subscriptionPlanEnum = pgEnum('subscription_plan', ['free', 'pro', 'enterprise']);

// ===========================================
// Accounts Table
// ===========================================

export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    plan: subscriptionPlanEnum('plan').notNull().default('free'),
    // Denormalized plan limits (for performance, updated when plan changes)
    maxApps: integer('max_apps').notNull().default(1),
    maxQueuesPerApp: integer('max_queues_per_app').notNull().default(1),
    maxTeamMembers: integer('max_team_members').default(0), // null = unlimited
    // Billing info (for future payment integration)
    billingEmail: text('billing_email'),
    billingAddress: jsonb('billing_address').$type<{
      line1?: string;
      line2?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      country?: string;
    }>(),
    stripeCustomerId: text('stripe_customer_id'),
    stripeSubscriptionId: text('stripe_subscription_id'),
    // Status
    isActive: boolean('is_active').notNull().default(true),
    trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
    currentPeriodEndsAt: timestamp('current_period_ends_at', { withTimezone: true }),
    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('accounts_plan_idx').on(table.plan),
    index('accounts_is_active_idx').on(table.isActive),
    index('accounts_stripe_customer_id_idx').on(table.stripeCustomerId),
  ]
);

export type AccountRow = typeof accounts.$inferSelect;
export type NewAccountRow = typeof accounts.$inferInsert;
