import { eq, and, desc, isNull, or, gt, lt, sql } from 'drizzle-orm';
import { getDatabase, suppressionList } from '@mail-queue/db';
import { logger } from '../lib/logger.js';
import { parseCursor, buildPaginationResult } from '../lib/cursor.js';

export type SuppressionReason =
  | 'hard_bounce'
  | 'soft_bounce'
  | 'complaint'
  | 'unsubscribe'
  | 'manual';

export interface SuppressionEntry {
  id: string;
  appId: string | null;
  emailAddress: string;
  reason: SuppressionReason;
  sourceEmailId: string | null;
  expiresAt: Date | null;
  createdAt: Date;
}

export interface AddSuppressionOptions {
  appId: string | null;
  emailAddress: string;
  reason: SuppressionReason;
  sourceEmailId?: string;
  expiresAt?: Date;
}

export interface ListSuppressionsOptions {
  appId: string | null | undefined;
  limit?: number;
  cursor?: string;
  reason?: SuppressionReason;
}

export interface SuppressionListResult {
  entries: SuppressionEntry[];
  cursor: string | null;
  hasMore: boolean;
}

/**
 * Add an email address to the suppression list
 */
export async function addToSuppressionList(
  options: AddSuppressionOptions
): Promise<SuppressionEntry> {
  const { appId, emailAddress, reason, sourceEmailId, expiresAt } = options;
  const db = getDatabase();
  const normalizedEmail = emailAddress.toLowerCase().trim();

  // Check if already suppressed for this app
  const whereClause = and(
    appId ? eq(suppressionList.appId, appId) : isNull(suppressionList.appId),
    eq(suppressionList.emailAddress, normalizedEmail)
  );

  const [existing] = await db.select().from(suppressionList).where(whereClause).limit(1);

  if (existing) {
    // Update the existing entry
    const [updated] = await db
      .update(suppressionList)
      .set({
        reason,
        sourceEmailId: sourceEmailId ?? existing.sourceEmailId,
        expiresAt: expiresAt ?? existing.expiresAt,
      })
      .where(eq(suppressionList.id, existing.id))
      .returning();

    logger.info({ appId, emailAddress: normalizedEmail, reason }, 'Suppression entry updated');

    return {
      id: updated?.id ?? existing.id,
      appId: updated?.appId ?? existing.appId,
      emailAddress: updated?.emailAddress ?? existing.emailAddress,
      reason: updated?.reason ?? existing.reason,
      sourceEmailId: updated?.sourceEmailId ?? existing.sourceEmailId,
      expiresAt: updated?.expiresAt ?? existing.expiresAt,
      createdAt: updated?.createdAt ?? existing.createdAt,
    };
  }

  // Create new entry
  const [created] = await db
    .insert(suppressionList)
    .values({
      appId: appId ?? null,
      emailAddress: normalizedEmail,
      reason,
      sourceEmailId: sourceEmailId ?? null,
      expiresAt: expiresAt ?? null,
    })
    .returning();

  logger.info({ appId, emailAddress: normalizedEmail, reason }, 'Email added to suppression list');

  return {
    id: created?.id ?? '',
    appId: created?.appId ?? appId,
    emailAddress: created?.emailAddress ?? normalizedEmail,
    reason: created?.reason ?? reason,
    sourceEmailId: created?.sourceEmailId ?? sourceEmailId ?? null,
    expiresAt: created?.expiresAt ?? expiresAt ?? null,
    createdAt: created?.createdAt ?? new Date(),
  };
}

/**
 * Remove an email address from the suppression list
 */
export async function removeFromSuppressionList(
  appId: string | null,
  emailAddress: string
): Promise<boolean> {
  const db = getDatabase();
  const normalizedEmail = emailAddress.toLowerCase().trim();

  const whereClause = and(
    appId ? eq(suppressionList.appId, appId) : isNull(suppressionList.appId),
    eq(suppressionList.emailAddress, normalizedEmail)
  );

  const result = await db
    .delete(suppressionList)
    .where(whereClause)
    .returning({ id: suppressionList.id });

  if (result.length > 0) {
    logger.info({ appId, emailAddress: normalizedEmail }, 'Email removed from suppression list');
    return true;
  }

  return false;
}

/**
 * Check if an email is suppressed
 */
export async function isEmailSuppressed(
  appId: string,
  emailAddress: string
): Promise<{ suppressed: boolean; reason?: SuppressionReason; expiresAt?: Date | null }> {
  const db = getDatabase();
  const normalizedEmail = emailAddress.toLowerCase().trim();
  const now = new Date();

  // Check both app-specific and global suppression
  const [suppression] = await db
    .select()
    .from(suppressionList)
    .where(
      and(
        eq(suppressionList.emailAddress, normalizedEmail),
        or(eq(suppressionList.appId, appId), isNull(suppressionList.appId)),
        // Only consider non-expired entries
        or(isNull(suppressionList.expiresAt), gt(suppressionList.expiresAt, now))
      )
    )
    .limit(1);

  if (suppression) {
    return {
      suppressed: true,
      reason: suppression.reason,
      expiresAt: suppression.expiresAt,
    };
  }

  return { suppressed: false };
}

/**
 * List suppressed emails for an app
 */
export async function listSuppressions(
  options: ListSuppressionsOptions
): Promise<SuppressionListResult> {
  const { appId, limit = 50, cursor, reason } = options;
  const db = getDatabase();

  const conditions = [];

  if (appId !== undefined) {
    conditions.push(appId ? eq(suppressionList.appId, appId) : isNull(suppressionList.appId));
  }

  if (reason) {
    conditions.push(eq(suppressionList.reason, reason));
  }

  // Apply cursor-based pagination
  const cursorData = parseCursor(cursor);
  if (cursorData) {
    const cursorDate = new Date(cursorData.c);
    const paginationCondition = or(
      lt(suppressionList.createdAt, cursorDate),
      and(eq(suppressionList.createdAt, cursorDate), lt(suppressionList.id, cursorData.i))
    );
    if (paginationCondition) {
      conditions.push(paginationCondition);
    }
  }

  const whereClause = and(...conditions);

  // Fetch limit + 1 to determine if there are more results
  const entryList = await db
    .select()
    .from(suppressionList)
    .where(whereClause)
    .orderBy(desc(suppressionList.createdAt), desc(suppressionList.id))
    .limit(limit + 1);

  const mappedEntries = entryList.map((e) => ({
    id: e.id,
    appId: e.appId,
    emailAddress: e.emailAddress,
    reason: e.reason,
    sourceEmailId: e.sourceEmailId,
    expiresAt: e.expiresAt,
    createdAt: e.createdAt,
  }));

  const result = buildPaginationResult(
    mappedEntries,
    limit,
    (e) => e.createdAt,
    (e) => e.id
  );

  return {
    entries: result.items,
    cursor: result.cursor,
    hasMore: result.hasMore,
  };
}

/**
 * Bulk add emails to suppression list
 */
export async function bulkAddToSuppressionList(
  appId: string | null,
  entries: Array<{ emailAddress: string; reason: SuppressionReason }>
): Promise<{ added: number; skipped: number }> {
  const db = getDatabase();
  let added = 0;
  let skipped = 0;

  for (const entry of entries) {
    const normalizedEmail = entry.emailAddress.toLowerCase().trim();

    // Check if already exists
    const [existing] = await db
      .select({ id: suppressionList.id })
      .from(suppressionList)
      .where(
        and(
          appId ? eq(suppressionList.appId, appId) : isNull(suppressionList.appId),
          eq(suppressionList.emailAddress, normalizedEmail)
        )
      )
      .limit(1);

    if (existing) {
      skipped++;
      continue;
    }

    await db.insert(suppressionList).values({
      appId: appId ?? null,
      emailAddress: normalizedEmail,
      reason: entry.reason,
    });
    added++;
  }

  logger.info({ appId, added, skipped }, 'Bulk suppression completed');

  return { added, skipped };
}

/**
 * Clean up expired suppression entries
 */
export async function cleanupExpiredSuppressions(): Promise<number> {
  const db = getDatabase();
  const now = new Date();

  const result = await db
    .delete(suppressionList)
    .where(
      and(sql`${suppressionList.expiresAt} IS NOT NULL`, sql`${suppressionList.expiresAt} < ${now}`)
    )
    .returning({ id: suppressionList.id });

  logger.info({ count: result.length }, 'Expired suppressions cleaned up');

  return result.length;
}
