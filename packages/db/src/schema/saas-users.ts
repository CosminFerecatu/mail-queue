import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { accounts } from './accounts.js';

// ===========================================
// SaaS Users Table (Platform Customers)
// ===========================================
// This table is for registered SaaS platform users
// Separate from the internal admin 'users' table

export const saasUsers = pgTable(
  'saas_users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    emailVerified: boolean('email_verified').notNull().default(false),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    passwordHash: text('password_hash'), // null for OAuth-only users
    name: text('name').notNull(),
    avatarUrl: text('avatar_url'),
    // OAuth provider IDs
    googleId: text('google_id'),
    githubId: text('github_id'),
    // Account ownership
    // onDelete: 'set null' - Preserve user if their owned account is deleted.
    // User can create or join another account.
    ownedAccountId: uuid('owned_account_id').references(() => accounts.id, {
      onDelete: 'set null',
    }),
    // Verification token for email verification
    verificationToken: text('verification_token'),
    verificationTokenExpiresAt: timestamp('verification_token_expires_at', {
      withTimezone: true,
    }),
    // Password reset
    passwordResetToken: text('password_reset_token'),
    passwordResetExpiresAt: timestamp('password_reset_expires_at', {
      withTimezone: true,
    }),
    // Activity tracking
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    lastLoginIp: text('last_login_ip'),
    // Status
    isActive: boolean('is_active').notNull().default(true),
    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('saas_users_email_idx').on(table.email),
    uniqueIndex('saas_users_google_id_idx').on(table.googleId),
    uniqueIndex('saas_users_github_id_idx').on(table.githubId),
    index('saas_users_owned_account_id_idx').on(table.ownedAccountId),
    index('saas_users_verification_token_idx').on(table.verificationToken),
    index('saas_users_password_reset_token_idx').on(table.passwordResetToken),
  ]
);

export type SaasUserRow = typeof saasUsers.$inferSelect;
export type NewSaasUserRow = typeof saasUsers.$inferInsert;
