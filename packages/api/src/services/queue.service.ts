import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { getDatabase, queues, smtpConfigs, emails, apps, type QueueRow } from '@mail-queue/db';
import type { CreateQueueInput, UpdateQueueInput } from '@mail-queue/core';
import { buildPaginationResult } from '../lib/cursor.js';
import { addPaginationConditions } from '../lib/pagination.js';

export interface QueueListResult {
  queues: QueueRow[];
  cursor: string | null;
  hasMore: boolean;
}

/**
 * Response interface for queue data returned by API endpoints.
 */
export interface QueueResponse {
  id: string;
  appId: string;
  name: string;
  priority: number;
  rateLimit: number | null;
  maxRetries: number;
  retryDelay: number[] | null;
  smtpConfigId: string | null;
  isPaused: boolean;
  settings: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Formats a queue row for API response.
 */
export function formatQueueResponse(queue: QueueRow): QueueResponse {
  return {
    id: queue.id,
    appId: queue.appId,
    name: queue.name,
    priority: queue.priority,
    rateLimit: queue.rateLimit,
    maxRetries: queue.maxRetries,
    retryDelay: queue.retryDelay,
    smtpConfigId: queue.smtpConfigId,
    isPaused: queue.isPaused,
    settings: queue.settings,
    createdAt: queue.createdAt,
    updatedAt: queue.updatedAt,
  };
}

export async function createQueue(appId: string, input: CreateQueueInput): Promise<QueueRow> {
  const db = getDatabase();

  // Verify SMTP config belongs to app if provided
  if (input.smtpConfigId) {
    const [config] = await db
      .select()
      .from(smtpConfigs)
      .where(and(eq(smtpConfigs.id, input.smtpConfigId), eq(smtpConfigs.appId, appId)))
      .limit(1);

    if (!config) {
      throw new Error('SMTP configuration not found or does not belong to this app');
    }
  }

  const [queue] = await db
    .insert(queues)
    .values({
      appId,
      name: input.name,
      priority: input.priority ?? 5,
      rateLimit: input.rateLimit ?? null,
      maxRetries: input.maxRetries ?? 5,
      retryDelay: input.retryDelay ?? [30, 120, 600, 3600, 86400],
      smtpConfigId: input.smtpConfigId ?? null,
      settings: input.settings ?? null,
    })
    .returning();

  if (!queue) {
    throw new Error('Failed to create queue');
  }

  return queue;
}

export async function getQueueById(id: string, appId?: string): Promise<QueueRow | null> {
  const db = getDatabase();

  const conditions = [eq(queues.id, id)];
  if (appId) {
    conditions.push(eq(queues.appId, appId));
  }

  const [queue] = await db
    .select()
    .from(queues)
    .where(and(...conditions))
    .limit(1);

  return queue ?? null;
}

export async function getQueueByName(name: string, appId: string): Promise<QueueRow | null> {
  const db = getDatabase();

  const [queue] = await db
    .select()
    .from(queues)
    .where(and(eq(queues.name, name), eq(queues.appId, appId)))
    .limit(1);

  return queue ?? null;
}

export async function getQueuesByAppId(
  appId: string,
  options: { limit?: number; cursor?: string } = {}
): Promise<QueueListResult> {
  const db = getDatabase();
  const { limit = 50, cursor } = options;

  const conditions: ReturnType<typeof eq>[] = [eq(queues.appId, appId)];

  // Apply cursor-based pagination
  addPaginationConditions(conditions, cursor, queues.createdAt, queues.id);

  // Fetch limit + 1 to determine if there are more results
  const queueList = await db
    .select()
    .from(queues)
    .where(and(...conditions))
    .orderBy(desc(queues.createdAt), desc(queues.id))
    .limit(limit + 1);

  const result = buildPaginationResult(
    queueList,
    limit,
    (q) => q.createdAt,
    (q) => q.id
  );

  return {
    queues: result.items,
    cursor: result.cursor,
    hasMore: result.hasMore,
  };
}

export async function getAllQueues(
  options: { limit?: number; cursor?: string } = {}
): Promise<QueueListResult> {
  const db = getDatabase();
  const { limit = 50, cursor } = options;

  const conditions: ReturnType<typeof eq>[] = [];

  // Apply cursor-based pagination
  addPaginationConditions(conditions, cursor, queues.createdAt, queues.id);

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Fetch limit + 1 to determine if there are more results
  const queueList = await db
    .select()
    .from(queues)
    .where(whereClause)
    .orderBy(desc(queues.createdAt), desc(queues.id))
    .limit(limit + 1);

  const result = buildPaginationResult(
    queueList,
    limit,
    (q) => q.createdAt,
    (q) => q.id
  );

  return {
    queues: result.items,
    cursor: result.cursor,
    hasMore: result.hasMore,
  };
}

export async function getQueuesByAccountId(
  accountId: string,
  options: { limit?: number; cursor?: string } = {}
): Promise<QueueListResult> {
  const db = getDatabase();
  const { limit = 50, cursor } = options;

  // First get all app IDs belonging to this account
  const accountApps = await db
    .select({ id: apps.id })
    .from(apps)
    .where(eq(apps.accountId, accountId));

  const appIds = accountApps.map((a) => a.id);

  if (appIds.length === 0) {
    return { queues: [], cursor: null, hasMore: false };
  }

  const conditions: ReturnType<typeof eq>[] = [inArray(queues.appId, appIds)];

  // Apply cursor-based pagination
  addPaginationConditions(conditions, cursor, queues.createdAt, queues.id);

  // Fetch limit + 1 to determine if there are more results
  const queueList = await db
    .select()
    .from(queues)
    .where(and(...conditions))
    .orderBy(desc(queues.createdAt), desc(queues.id))
    .limit(limit + 1);

  const result = buildPaginationResult(
    queueList,
    limit,
    (q) => q.createdAt,
    (q) => q.id
  );

  return {
    queues: result.items,
    cursor: result.cursor,
    hasMore: result.hasMore,
  };
}

export async function updateQueue(
  id: string,
  appId: string | undefined,
  input: UpdateQueueInput
): Promise<QueueRow | null> {
  const db = getDatabase();

  // Get the queue first to know its appId for SMTP config validation
  const existingQueue = await getQueueById(id, appId);
  if (!existingQueue) {
    return null;
  }

  // Verify SMTP config belongs to app if being updated
  if (input.smtpConfigId) {
    const [config] = await db
      .select()
      .from(smtpConfigs)
      .where(
        and(eq(smtpConfigs.id, input.smtpConfigId), eq(smtpConfigs.appId, existingQueue.appId))
      )
      .limit(1);

    if (!config) {
      throw new Error('SMTP configuration not found or does not belong to this app');
    }
  }

  const updateData: Partial<QueueRow> = {
    updatedAt: new Date(),
  };

  if (input.priority !== undefined) updateData.priority = input.priority;
  if (input.rateLimit !== undefined) updateData.rateLimit = input.rateLimit;
  if (input.maxRetries !== undefined) updateData.maxRetries = input.maxRetries;
  if (input.retryDelay !== undefined) updateData.retryDelay = input.retryDelay;
  if (input.smtpConfigId !== undefined) updateData.smtpConfigId = input.smtpConfigId;
  if (input.settings !== undefined) updateData.settings = input.settings;

  const conditions = [eq(queues.id, id)];
  if (appId) {
    conditions.push(eq(queues.appId, appId));
  }

  const [updated] = await db
    .update(queues)
    .set(updateData)
    .where(and(...conditions))
    .returning();

  return updated ?? null;
}

export async function deleteQueue(id: string, appId?: string): Promise<boolean> {
  const db = getDatabase();

  const conditions = [eq(queues.id, id)];
  if (appId) {
    conditions.push(eq(queues.appId, appId));
  }

  const result = await db
    .delete(queues)
    .where(and(...conditions))
    .returning({ id: queues.id });

  return result.length > 0;
}

export async function pauseQueue(id: string, appId?: string): Promise<boolean> {
  const db = getDatabase();

  const conditions = [eq(queues.id, id)];
  if (appId) {
    conditions.push(eq(queues.appId, appId));
  }

  const result = await db
    .update(queues)
    .set({ isPaused: true, updatedAt: new Date() })
    .where(and(...conditions))
    .returning({ id: queues.id });

  return result.length > 0;
}

export async function resumeQueue(id: string, appId?: string): Promise<boolean> {
  const db = getDatabase();

  const conditions = [eq(queues.id, id)];
  if (appId) {
    conditions.push(eq(queues.appId, appId));
  }

  const result = await db
    .update(queues)
    .set({ isPaused: false, updatedAt: new Date() })
    .where(and(...conditions))
    .returning({ id: queues.id });

  return result.length > 0;
}

export interface QueueStats {
  queueId: string;
  queueName: string;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  delayed: number;
  isPaused: boolean;
}

export async function getQueueStats(id: string, appId?: string): Promise<QueueStats | null> {
  const db = getDatabase();

  const conditions = [eq(queues.id, id)];
  if (appId) {
    conditions.push(eq(queues.appId, appId));
  }

  const [queue] = await db
    .select()
    .from(queues)
    .where(and(...conditions))
    .limit(1);

  if (!queue) {
    return null;
  }

  // Get email counts by status from database
  const statusCounts = await db
    .select({
      status: emails.status,
      count: sql<number>`count(*)::int`,
    })
    .from(emails)
    .where(eq(emails.queueId, id))
    .groupBy(emails.status);

  const counts: Record<string, number> = {};
  for (const row of statusCounts) {
    counts[row.status] = row.count;
  }

  // Note: BullMQ stats were previously fetched here but are not used.
  // We use database counts for accurate per-queue statistics.

  return {
    queueId: queue.id,
    queueName: queue.name,
    pending: counts['queued'] ?? 0,
    processing: counts['processing'] ?? 0,
    completed: counts['sent'] ?? 0,
    failed: counts['failed'] ?? 0,
    delayed: counts['queued'] ?? 0, // Scheduled emails
    isPaused: queue.isPaused,
  };
}
