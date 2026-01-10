import { eq, and, desc, sql } from 'drizzle-orm';
import { getDatabase, queues, smtpConfigs, emails, type QueueRow } from '@mail-queue/db';
import type { CreateQueueInput, UpdateQueueInput } from '@mail-queue/core';
import { getEmailQueue } from '../lib/queue.js';

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

export async function getQueueById(id: string, appId: string): Promise<QueueRow | null> {
  const db = getDatabase();

  const [queue] = await db
    .select()
    .from(queues)
    .where(and(eq(queues.id, id), eq(queues.appId, appId)))
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
  options: { limit?: number; offset?: number } = {}
): Promise<{ queues: QueueRow[]; total: number }> {
  const db = getDatabase();
  const { limit = 50, offset = 0 } = options;

  const [queueList, countResult] = await Promise.all([
    db
      .select()
      .from(queues)
      .where(eq(queues.appId, appId))
      .orderBy(desc(queues.priority), queues.name)
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(queues)
      .where(eq(queues.appId, appId)),
  ]);

  return {
    queues: queueList,
    total: countResult[0]?.count ?? 0,
  };
}

export async function updateQueue(
  id: string,
  appId: string,
  input: UpdateQueueInput
): Promise<QueueRow | null> {
  const db = getDatabase();

  // Verify SMTP config belongs to app if being updated
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

  const updateData: Partial<QueueRow> = {
    updatedAt: new Date(),
  };

  if (input.priority !== undefined) updateData.priority = input.priority;
  if (input.rateLimit !== undefined) updateData.rateLimit = input.rateLimit;
  if (input.maxRetries !== undefined) updateData.maxRetries = input.maxRetries;
  if (input.retryDelay !== undefined) updateData.retryDelay = input.retryDelay;
  if (input.smtpConfigId !== undefined) updateData.smtpConfigId = input.smtpConfigId;
  if (input.settings !== undefined) updateData.settings = input.settings;

  const [updated] = await db
    .update(queues)
    .set(updateData)
    .where(and(eq(queues.id, id), eq(queues.appId, appId)))
    .returning();

  return updated ?? null;
}

export async function deleteQueue(id: string, appId: string): Promise<boolean> {
  const db = getDatabase();

  const result = await db
    .delete(queues)
    .where(and(eq(queues.id, id), eq(queues.appId, appId)))
    .returning({ id: queues.id });

  return result.length > 0;
}

export async function pauseQueue(id: string, appId: string): Promise<boolean> {
  const db = getDatabase();

  const result = await db
    .update(queues)
    .set({ isPaused: true, updatedAt: new Date() })
    .where(and(eq(queues.id, id), eq(queues.appId, appId)))
    .returning({ id: queues.id });

  return result.length > 0;
}

export async function resumeQueue(id: string, appId: string): Promise<boolean> {
  const db = getDatabase();

  const result = await db
    .update(queues)
    .set({ isPaused: false, updatedAt: new Date() })
    .where(and(eq(queues.id, id), eq(queues.appId, appId)))
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

export async function getQueueStats(id: string, appId: string): Promise<QueueStats | null> {
  const db = getDatabase();

  const [queue] = await db
    .select()
    .from(queues)
    .where(and(eq(queues.id, id), eq(queues.appId, appId)))
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

  // Get BullMQ queue stats
  const bullQueue = getEmailQueue();
  const [waiting, active, delayed, failed] = await Promise.all([
    bullQueue.getWaitingCount(),
    bullQueue.getActiveCount(),
    bullQueue.getDelayedCount(),
    bullQueue.getFailedCount(),
  ]);

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
