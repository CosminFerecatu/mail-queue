import { eq, and } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import {
  saasUsers,
  accounts,
  teamMemberships,
  getDatabase,
  type SaasUserRow,
} from '@mail-queue/db';
import { getPlanLimits } from '@mail-queue/core';

const BCRYPT_ROUNDS = 12;

export interface CreateSaasUserInput {
  email: string;
  password: string;
  name: string;
}

export interface SaasUserWithAccount {
  user: {
    id: string;
    email: string;
    name: string;
    avatarUrl: string | null;
    emailVerified: boolean;
  };
  account: {
    id: string;
    name: string;
    plan: 'free' | 'pro' | 'enterprise';
    role: 'owner' | 'admin' | 'editor' | 'viewer';
  } | null;
}

// Generate a secure random token
function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Create a new SaaS user with their own account
export async function createSaasUser(input: CreateSaasUserInput): Promise<SaasUserWithAccount> {
  const db = getDatabase();

  // Check if email already exists
  const [existingUser] = await db
    .select()
    .from(saasUsers)
    .where(eq(saasUsers.email, input.email.toLowerCase()))
    .limit(1);

  if (existingUser) {
    throw new Error('EMAIL_EXISTS');
  }

  // Hash password
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  // Generate verification token
  const verificationToken = generateToken();
  const verificationTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  // Get plan limits for free plan
  const planLimits = getPlanLimits('free');

  // Create account first
  const [account] = await db
    .insert(accounts)
    .values({
      name: `${input.name}'s Account`,
      plan: 'free',
      maxApps: planLimits.maxApps,
      maxQueuesPerApp: planLimits.maxQueuesPerApp,
      maxTeamMembers: planLimits.maxTeamMembers,
    })
    .returning();

  if (!account) {
    throw new Error('Failed to create account');
  }

  // Create user
  const [user] = await db
    .insert(saasUsers)
    .values({
      email: input.email.toLowerCase(),
      passwordHash,
      name: input.name,
      ownedAccountId: account.id,
      verificationToken,
      verificationTokenExpiresAt,
    })
    .returning();

  if (!user) {
    throw new Error('Failed to create user');
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      emailVerified: user.emailVerified,
    },
    account: {
      id: account.id,
      name: account.name,
      plan: account.plan,
      role: 'owner',
    },
  };
}

// Validate credentials and return user with account
export async function validateSaasCredentials(
  email: string,
  password: string
): Promise<SaasUserWithAccount | null> {
  const db = getDatabase();

  const [user] = await db
    .select()
    .from(saasUsers)
    .where(eq(saasUsers.email, email.toLowerCase()))
    .limit(1);

  if (!user || !user.passwordHash) {
    return null;
  }

  if (!user.isActive) {
    throw new Error('ACCOUNT_DISABLED');
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    return null;
  }

  // Update last login
  await db.update(saasUsers).set({ lastLoginAt: new Date() }).where(eq(saasUsers.id, user.id));

  // Get account info
  const accountInfo = await getUserAccountInfo(user);

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      emailVerified: user.emailVerified,
    },
    account: accountInfo,
  };
}

// Handle OAuth user (Google, GitHub, etc.)
export async function handleOAuthUser(input: {
  provider: 'google' | 'github';
  providerId: string;
  email: string;
  name: string;
  image?: string;
}): Promise<SaasUserWithAccount> {
  const db = getDatabase();

  // Check if user exists with this OAuth ID
  const providerIdField = input.provider === 'google' ? saasUsers.googleId : saasUsers.githubId;

  let [user] = await db
    .select()
    .from(saasUsers)
    .where(eq(providerIdField, input.providerId))
    .limit(1);

  if (user) {
    // Existing OAuth user - update last login
    await db.update(saasUsers).set({ lastLoginAt: new Date() }).where(eq(saasUsers.id, user.id));

    const accountInfo = await getUserAccountInfo(user);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        emailVerified: user.emailVerified,
      },
      account: accountInfo,
    };
  }

  // Check if user exists with this email
  [user] = await db
    .select()
    .from(saasUsers)
    .where(eq(saasUsers.email, input.email.toLowerCase()))
    .limit(1);

  if (user) {
    // Link OAuth to existing user
    const updateData =
      input.provider === 'google'
        ? { googleId: input.providerId, emailVerified: true, emailVerifiedAt: new Date() }
        : { githubId: input.providerId, emailVerified: true, emailVerifiedAt: new Date() };

    await db
      .update(saasUsers)
      .set({ ...updateData, lastLoginAt: new Date() })
      .where(eq(saasUsers.id, user.id));

    const accountInfo = await getUserAccountInfo(user);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl || input.image || null,
        emailVerified: true,
      },
      account: accountInfo,
    };
  }

  // Create new user with OAuth
  const planLimits = getPlanLimits('free');

  // Create account first
  const [account] = await db
    .insert(accounts)
    .values({
      name: `${input.name}'s Account`,
      plan: 'free',
      maxApps: planLimits.maxApps,
      maxQueuesPerApp: planLimits.maxQueuesPerApp,
      maxTeamMembers: planLimits.maxTeamMembers,
    })
    .returning();

  if (!account) {
    throw new Error('Failed to create account');
  }

  // Create user with OAuth
  const userData = {
    email: input.email.toLowerCase(),
    name: input.name,
    avatarUrl: input.image || null,
    ownedAccountId: account.id,
    emailVerified: true,
    emailVerifiedAt: new Date(),
    lastLoginAt: new Date(),
    ...(input.provider === 'google'
      ? { googleId: input.providerId }
      : { githubId: input.providerId }),
  };

  const [newUser] = await db.insert(saasUsers).values(userData).returning();

  if (!newUser) {
    throw new Error('Failed to create user');
  }

  return {
    user: {
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      avatarUrl: newUser.avatarUrl,
      emailVerified: newUser.emailVerified,
    },
    account: {
      id: account.id,
      name: account.name,
      plan: account.plan,
      role: 'owner',
    },
  };
}

// Get user's account info (owned or member)
async function getUserAccountInfo(user: SaasUserRow): Promise<{
  id: string;
  name: string;
  plan: 'free' | 'pro' | 'enterprise';
  role: 'owner' | 'admin' | 'editor' | 'viewer';
} | null> {
  const db = getDatabase();

  // Check if user owns an account
  if (user.ownedAccountId) {
    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, user.ownedAccountId))
      .limit(1);

    if (account) {
      return {
        id: account.id,
        name: account.name,
        plan: account.plan,
        role: 'owner',
      };
    }
  }

  // Check if user is a member of any account
  const [membership] = await db
    .select({
      accountId: teamMemberships.accountId,
      role: teamMemberships.role,
      accountName: accounts.name,
      accountPlan: accounts.plan,
    })
    .from(teamMemberships)
    .innerJoin(accounts, eq(teamMemberships.accountId, accounts.id))
    .where(and(eq(teamMemberships.userId, user.id), eq(accounts.isActive, true)))
    .limit(1);

  if (membership) {
    return {
      id: membership.accountId,
      name: membership.accountName,
      plan: membership.accountPlan,
      role: membership.role,
    };
  }

  return null;
}

// Verify email with token
export async function verifyEmail(token: string): Promise<boolean> {
  const db = getDatabase();

  const [user] = await db
    .select()
    .from(saasUsers)
    .where(eq(saasUsers.verificationToken, token))
    .limit(1);

  if (!user) {
    return false;
  }

  if (user.verificationTokenExpiresAt && user.verificationTokenExpiresAt < new Date()) {
    return false;
  }

  await db
    .update(saasUsers)
    .set({
      emailVerified: true,
      emailVerifiedAt: new Date(),
      verificationToken: null,
      verificationTokenExpiresAt: null,
    })
    .where(eq(saasUsers.id, user.id));

  return true;
}

// Request password reset
export async function requestPasswordReset(email: string): Promise<string | null> {
  const db = getDatabase();

  const [user] = await db
    .select()
    .from(saasUsers)
    .where(eq(saasUsers.email, email.toLowerCase()))
    .limit(1);

  if (!user) {
    // Don't reveal if email exists
    return null;
  }

  const resetToken = generateToken();
  const resetExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await db
    .update(saasUsers)
    .set({
      passwordResetToken: resetToken,
      passwordResetExpiresAt: resetExpiresAt,
    })
    .where(eq(saasUsers.id, user.id));

  return resetToken;
}

// Reset password with token
export async function resetPassword(token: string, newPassword: string): Promise<boolean> {
  const db = getDatabase();

  const [user] = await db
    .select()
    .from(saasUsers)
    .where(eq(saasUsers.passwordResetToken, token))
    .limit(1);

  if (!user) {
    return false;
  }

  if (user.passwordResetExpiresAt && user.passwordResetExpiresAt < new Date()) {
    return false;
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

  await db
    .update(saasUsers)
    .set({
      passwordHash,
      passwordResetToken: null,
      passwordResetExpiresAt: null,
    })
    .where(eq(saasUsers.id, user.id));

  return true;
}

// Get user by ID
export async function getSaasUserById(userId: string): Promise<SaasUserWithAccount | null> {
  const db = getDatabase();

  const [user] = await db.select().from(saasUsers).where(eq(saasUsers.id, userId)).limit(1);

  if (!user) {
    return null;
  }

  const accountInfo = await getUserAccountInfo(user);

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      emailVerified: user.emailVerified,
    },
    account: accountInfo,
  };
}
