import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { accounts } from './accounts.js';
import { saasUsers } from './saas-users.js';

// ===========================================
// Team Role Enum
// ===========================================

export const teamRoleEnum = pgEnum('team_role', ['admin', 'editor', 'viewer']);

// ===========================================
// Team Memberships Table
// ===========================================
// Links users to accounts with role-based access

export const teamMemberships = pgTable(
  'team_memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => saasUsers.id, { onDelete: 'cascade' }),
    role: teamRoleEnum('role').notNull().default('viewer'),
    // Optional per-app permission overrides
    // { appId: { canManageQueues: true, canViewEmails: true } }
    appPermissions:
      jsonb('app_permissions').$type<
        Record<
          string,
          {
            canManageQueues?: boolean;
            canManageEmails?: boolean;
            canViewAnalytics?: boolean;
            canManageApiKeys?: boolean;
          }
        >
      >(),
    // Invitation tracking
    invitedBy: uuid('invited_by').references(() => saasUsers.id, {
      onDelete: 'set null',
    }),
    invitedAt: timestamp('invited_at', { withTimezone: true }).notNull().defaultNow(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('team_memberships_account_user_idx').on(table.accountId, table.userId),
    index('team_memberships_account_id_idx').on(table.accountId),
    index('team_memberships_user_id_idx').on(table.userId),
  ]
);

export type TeamMembershipRow = typeof teamMemberships.$inferSelect;
export type NewTeamMembershipRow = typeof teamMemberships.$inferInsert;

// ===========================================
// Team Invitations Table
// ===========================================
// Pending team member invitations

export const teamInvitations = pgTable(
  'team_invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: teamRoleEnum('role').notNull().default('viewer'),
    // Secure invitation token
    token: text('token').notNull(),
    // Invitation metadata
    invitedBy: uuid('invited_by')
      .notNull()
      .references(() => saasUsers.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('team_invitations_token_idx').on(table.token),
    uniqueIndex('team_invitations_account_email_idx').on(table.accountId, table.email),
    index('team_invitations_account_id_idx').on(table.accountId),
    index('team_invitations_email_idx').on(table.email),
  ]
);

export type TeamInvitationRow = typeof teamInvitations.$inferSelect;
export type NewTeamInvitationRow = typeof teamInvitations.$inferInsert;
