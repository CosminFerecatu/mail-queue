import { eq, and, count } from 'drizzle-orm';
import {
  accounts,
  apps,
  teamMemberships,
  saasUsers,
  getDatabase,
  type AccountRow,
} from '@mail-queue/db';
import { getPlanLimits, type SubscriptionPlanId } from '@mail-queue/core';

export interface AccountWithUsage {
  id: string;
  name: string;
  plan: 'free' | 'pro' | 'enterprise';
  isActive: boolean;
  limits: {
    maxApps: number;
    maxQueuesPerApp: number;
    maxTeamMembers: number | null;
  };
  usage: {
    apps: number;
    teamMembers: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

// Get account by ID with usage stats
export async function getAccountById(accountId: string): Promise<AccountWithUsage | null> {
  const db = getDatabase();

  const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);

  if (!account) {
    return null;
  }

  // Get app count
  const [appCount] = await db
    .select({ count: count() })
    .from(apps)
    .where(eq(apps.accountId, accountId));

  // Get team member count
  const [memberCount] = await db
    .select({ count: count() })
    .from(teamMemberships)
    .where(eq(teamMemberships.accountId, accountId));

  return {
    id: account.id,
    name: account.name,
    plan: account.plan,
    isActive: account.isActive,
    limits: {
      maxApps: account.maxApps,
      maxQueuesPerApp: account.maxQueuesPerApp,
      maxTeamMembers: account.maxTeamMembers,
    },
    usage: {
      apps: appCount?.count ?? 0,
      teamMembers: memberCount?.count ?? 0,
    },
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

// Update account name
export async function updateAccountName(
  accountId: string,
  name: string
): Promise<AccountRow | null> {
  const db = getDatabase();

  const [updated] = await db
    .update(accounts)
    .set({ name, updatedAt: new Date() })
    .where(eq(accounts.id, accountId))
    .returning();

  return updated ?? null;
}

// Update account plan
export async function updateAccountPlan(
  accountId: string,
  planId: SubscriptionPlanId
): Promise<AccountRow | null> {
  const db = getDatabase();

  const limits = getPlanLimits(planId);

  const [updated] = await db
    .update(accounts)
    .set({
      plan: planId,
      maxApps: limits.maxApps,
      maxQueuesPerApp: limits.maxQueuesPerApp,
      maxTeamMembers: limits.maxTeamMembers,
      updatedAt: new Date(),
    })
    .where(eq(accounts.id, accountId))
    .returning();

  return updated ?? null;
}

// Check if account can create more apps
export async function canCreateApp(accountId: string): Promise<{
  allowed: boolean;
  current: number;
  max: number;
}> {
  const db = getDatabase();

  const [account] = await db
    .select({ maxApps: accounts.maxApps })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);

  if (!account) {
    return { allowed: false, current: 0, max: 0 };
  }

  const [appCount] = await db
    .select({ count: count() })
    .from(apps)
    .where(eq(apps.accountId, accountId));

  const current = appCount?.count ?? 0;
  const max = account.maxApps;

  return {
    allowed: current < max,
    current,
    max,
  };
}

// Check if app can have more queues
export async function canCreateQueue(
  accountId: string,
  appId: string
): Promise<{
  allowed: boolean;
  current: number;
  max: number;
}> {
  const db = getDatabase();

  // Verify app belongs to account
  const [app] = await db
    .select()
    .from(apps)
    .where(and(eq(apps.id, appId), eq(apps.accountId, accountId)))
    .limit(1);

  if (!app) {
    return { allowed: false, current: 0, max: 0 };
  }

  const [account] = await db
    .select({ maxQueuesPerApp: accounts.maxQueuesPerApp })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);

  if (!account) {
    return { allowed: false, current: 0, max: 0 };
  }

  // Import queues here to avoid circular dependency
  const { queues } = await import('@mail-queue/db');

  const [queueCount] = await db
    .select({ count: count() })
    .from(queues)
    .where(eq(queues.appId, appId));

  const current = queueCount?.count ?? 0;
  const max = account.maxQueuesPerApp;

  return {
    allowed: current < max,
    current,
    max,
  };
}

// Check if account can add more team members
export async function canAddTeamMember(accountId: string): Promise<{
  allowed: boolean;
  current: number;
  max: number | null;
}> {
  const db = getDatabase();

  const [account] = await db
    .select({ maxTeamMembers: accounts.maxTeamMembers })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);

  if (!account) {
    return { allowed: false, current: 0, max: 0 };
  }

  const [memberCount] = await db
    .select({ count: count() })
    .from(teamMemberships)
    .where(eq(teamMemberships.accountId, accountId));

  const current = memberCount?.count ?? 0;
  const max = account.maxTeamMembers;

  // null means unlimited
  if (max === null) {
    return { allowed: true, current, max: null };
  }

  return {
    allowed: current < max,
    current,
    max,
  };
}

// Get account owner
export async function getAccountOwner(accountId: string): Promise<{
  id: string;
  email: string;
  name: string;
} | null> {
  const db = getDatabase();

  const [owner] = await db
    .select({
      id: saasUsers.id,
      email: saasUsers.email,
      name: saasUsers.name,
    })
    .from(saasUsers)
    .where(eq(saasUsers.ownedAccountId, accountId))
    .limit(1);

  return owner ?? null;
}

// Get all apps for an account
export async function getAccountApps(accountId: string) {
  const db = getDatabase();

  return db.select().from(apps).where(eq(apps.accountId, accountId));
}
