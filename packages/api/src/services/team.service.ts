import { eq, and } from 'drizzle-orm';
import crypto from 'node:crypto';
import {
  teamMemberships,
  teamInvitations,
  saasUsers,
  accounts,
  getDatabase,
  type TeamMembershipRow,
} from '@mail-queue/db';
import { canAddTeamMember } from './account.service.js';

export interface TeamMember {
  id: string;
  userId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: 'admin' | 'editor' | 'viewer';
  invitedAt: Date;
  acceptedAt: Date | null;
}

export interface TeamInvitation {
  id: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
  token: string;
  invitedBy: {
    id: string;
    name: string;
    email: string;
  };
  expiresAt: Date;
  createdAt: Date;
}

// Generate secure invitation token
function generateInviteToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Get all team members for an account
export async function getTeamMembers(accountId: string): Promise<TeamMember[]> {
  const db = getDatabase();

  const members = await db
    .select({
      id: teamMemberships.id,
      userId: teamMemberships.userId,
      email: saasUsers.email,
      name: saasUsers.name,
      avatarUrl: saasUsers.avatarUrl,
      role: teamMemberships.role,
      invitedAt: teamMemberships.invitedAt,
      acceptedAt: teamMemberships.acceptedAt,
    })
    .from(teamMemberships)
    .innerJoin(saasUsers, eq(teamMemberships.userId, saasUsers.id))
    .where(eq(teamMemberships.accountId, accountId));

  return members;
}

// Get pending invitations for an account
export async function getPendingInvitations(accountId: string): Promise<TeamInvitation[]> {
  const db = getDatabase();

  const invitations = await db
    .select({
      id: teamInvitations.id,
      email: teamInvitations.email,
      role: teamInvitations.role,
      token: teamInvitations.token,
      invitedById: teamInvitations.invitedBy,
      invitedByName: saasUsers.name,
      invitedByEmail: saasUsers.email,
      expiresAt: teamInvitations.expiresAt,
      createdAt: teamInvitations.createdAt,
    })
    .from(teamInvitations)
    .innerJoin(saasUsers, eq(teamInvitations.invitedBy, saasUsers.id))
    .where(eq(teamInvitations.accountId, accountId));

  return invitations.map((inv) => ({
    id: inv.id,
    email: inv.email,
    role: inv.role,
    token: inv.token,
    invitedBy: {
      id: inv.invitedById,
      name: inv.invitedByName,
      email: inv.invitedByEmail,
    },
    expiresAt: inv.expiresAt,
    createdAt: inv.createdAt,
  }));
}

// Create team invitation
export async function createInvitation(input: {
  accountId: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
  invitedBy: string;
}): Promise<TeamInvitation> {
  const db = getDatabase();

  // Check if can add more team members
  const limitCheck = await canAddTeamMember(input.accountId);
  if (!limitCheck.allowed) {
    throw new Error('TEAM_LIMIT_EXCEEDED');
  }

  // Check if user is already a member
  const [existingUser] = await db
    .select()
    .from(saasUsers)
    .where(eq(saasUsers.email, input.email.toLowerCase()))
    .limit(1);

  if (existingUser) {
    const [existingMembership] = await db
      .select()
      .from(teamMemberships)
      .where(
        and(
          eq(teamMemberships.accountId, input.accountId),
          eq(teamMemberships.userId, existingUser.id)
        )
      )
      .limit(1);

    if (existingMembership) {
      throw new Error('ALREADY_MEMBER');
    }
  }

  // Check if invitation already exists
  const [existingInvitation] = await db
    .select()
    .from(teamInvitations)
    .where(
      and(
        eq(teamInvitations.accountId, input.accountId),
        eq(teamInvitations.email, input.email.toLowerCase())
      )
    )
    .limit(1);

  if (existingInvitation) {
    // Delete old invitation and create new one
    await db.delete(teamInvitations).where(eq(teamInvitations.id, existingInvitation.id));
  }

  // Create invitation
  const token = generateInviteToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const [invitation] = await db
    .insert(teamInvitations)
    .values({
      accountId: input.accountId,
      email: input.email.toLowerCase(),
      role: input.role,
      token,
      invitedBy: input.invitedBy,
      expiresAt,
    })
    .returning();

  if (!invitation) {
    throw new Error('Failed to create invitation');
  }

  // Get inviter info
  const [inviter] = await db
    .select({
      id: saasUsers.id,
      name: saasUsers.name,
      email: saasUsers.email,
    })
    .from(saasUsers)
    .where(eq(saasUsers.id, input.invitedBy))
    .limit(1);

  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    token: invitation.token,
    invitedBy: {
      id: inviter?.id ?? '',
      name: inviter?.name ?? '',
      email: inviter?.email ?? '',
    },
    expiresAt: invitation.expiresAt,
    createdAt: invitation.createdAt,
  };
}

// Accept team invitation
export async function acceptInvitation(
  token: string,
  userId: string
): Promise<TeamMembershipRow | null> {
  const db = getDatabase();

  // Find invitation
  const [invitation] = await db
    .select()
    .from(teamInvitations)
    .where(eq(teamInvitations.token, token))
    .limit(1);

  if (!invitation) {
    return null;
  }

  // Check if expired
  if (invitation.expiresAt < new Date()) {
    // Delete expired invitation
    await db.delete(teamInvitations).where(eq(teamInvitations.id, invitation.id));
    throw new Error('INVITATION_EXPIRED');
  }

  // Get user
  const [user] = await db.select().from(saasUsers).where(eq(saasUsers.id, userId)).limit(1);

  if (!user) {
    throw new Error('USER_NOT_FOUND');
  }

  // Check if email matches (if user is logged in with different email)
  if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
    throw new Error('EMAIL_MISMATCH');
  }

  // Check if already a member
  const [existingMembership] = await db
    .select()
    .from(teamMemberships)
    .where(
      and(eq(teamMemberships.accountId, invitation.accountId), eq(teamMemberships.userId, userId))
    )
    .limit(1);

  if (existingMembership) {
    // Delete invitation and return existing membership
    await db.delete(teamInvitations).where(eq(teamInvitations.id, invitation.id));
    return existingMembership;
  }

  // Create membership
  const [membership] = await db
    .insert(teamMemberships)
    .values({
      accountId: invitation.accountId,
      userId,
      role: invitation.role,
      invitedBy: invitation.invitedBy,
      acceptedAt: new Date(),
    })
    .returning();

  if (!membership) {
    throw new Error('Failed to create membership');
  }

  // Delete invitation
  await db.delete(teamInvitations).where(eq(teamInvitations.id, invitation.id));

  return membership;
}

// Cancel/delete invitation
export async function cancelInvitation(invitationId: string, accountId: string): Promise<boolean> {
  const db = getDatabase();

  const result = await db
    .delete(teamInvitations)
    .where(and(eq(teamInvitations.id, invitationId), eq(teamInvitations.accountId, accountId)))
    .returning();

  return result.length > 0;
}

// Update team member role
export async function updateMemberRole(
  membershipId: string,
  accountId: string,
  newRole: 'admin' | 'editor' | 'viewer'
): Promise<TeamMembershipRow | null> {
  const db = getDatabase();

  const [updated] = await db
    .update(teamMemberships)
    .set({ role: newRole, updatedAt: new Date() })
    .where(and(eq(teamMemberships.id, membershipId), eq(teamMemberships.accountId, accountId)))
    .returning();

  return updated ?? null;
}

// Remove team member
export async function removeMember(membershipId: string, accountId: string): Promise<boolean> {
  const db = getDatabase();

  const result = await db
    .delete(teamMemberships)
    .where(and(eq(teamMemberships.id, membershipId), eq(teamMemberships.accountId, accountId)))
    .returning();

  return result.length > 0;
}

// Get invitation by token (for public accept page)
export async function getInvitationByToken(token: string): Promise<{
  id: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
  accountName: string;
  inviterName: string;
  expiresAt: Date;
  expired: boolean;
} | null> {
  const db = getDatabase();

  const [invitation] = await db
    .select({
      id: teamInvitations.id,
      email: teamInvitations.email,
      role: teamInvitations.role,
      accountId: teamInvitations.accountId,
      invitedBy: teamInvitations.invitedBy,
      expiresAt: teamInvitations.expiresAt,
    })
    .from(teamInvitations)
    .where(eq(teamInvitations.token, token))
    .limit(1);

  if (!invitation) {
    return null;
  }

  // Get account name
  const [account] = await db
    .select({ name: accounts.name })
    .from(accounts)
    .where(eq(accounts.id, invitation.accountId))
    .limit(1);

  // Get inviter name
  const [inviter] = await db
    .select({ name: saasUsers.name })
    .from(saasUsers)
    .where(eq(saasUsers.id, invitation.invitedBy))
    .limit(1);

  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    accountName: account?.name ?? 'Unknown',
    inviterName: inviter?.name ?? 'Unknown',
    expiresAt: invitation.expiresAt,
    expired: invitation.expiresAt < new Date(),
  };
}
