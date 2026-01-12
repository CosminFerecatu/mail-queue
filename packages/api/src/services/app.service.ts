import { eq, desc, and } from 'drizzle-orm';
import { getDatabase, apps, type AppRow } from '@mail-queue/db';
import {
  type CreateAppInput,
  type UpdateAppInput,
  encrypt,
  serialize,
  generateSecret,
  parseEncryptionKey,
} from '@mail-queue/core';
import { config } from '../config.js';
import { buildPaginationResult } from '../lib/cursor.js';
import { addPaginationConditions } from '../lib/pagination.js';

const encryptionKey = parseEncryptionKey(config.encryptionKey);

export interface AppWithStats extends AppRow {
  emailCount?: number;
  queueCount?: number;
}

/**
 * Response interface for app data returned by API endpoints.
 * Excludes sensitive fields like webhookSecret.
 */
export interface AppResponse {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  sandboxMode: boolean;
  webhookUrl: string | null;
  dailyLimit: number | null;
  monthlyLimit: number | null;
  settings: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Formats an app row for API response, excluding sensitive fields.
 */
export function formatAppResponse(app: AppRow): AppResponse {
  return {
    id: app.id,
    name: app.name,
    description: app.description,
    isActive: app.isActive,
    sandboxMode: app.sandboxMode,
    webhookUrl: app.webhookUrl,
    dailyLimit: app.dailyLimit,
    monthlyLimit: app.monthlyLimit,
    settings: app.settings,
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
  };
}

export async function createApp(input: CreateAppInput & { accountId?: string }): Promise<AppRow> {
  const db = getDatabase();

  let webhookSecret: string | null = null;
  if (input.webhookUrl) {
    const secret = generateSecret(32);
    const encrypted = encrypt(secret, encryptionKey);
    webhookSecret = serialize(encrypted);
  }

  const [app] = await db
    .insert(apps)
    .values({
      name: input.name,
      description: input.description ?? null,
      isActive: input.isActive ?? true,
      sandboxMode: input.sandboxMode ?? false,
      webhookUrl: input.webhookUrl ?? null,
      webhookSecret,
      dailyLimit: input.dailyLimit ?? null,
      monthlyLimit: input.monthlyLimit ?? null,
      settings: input.settings ?? null,
      accountId: input.accountId ?? null,
    })
    .returning();

  if (!app) {
    throw new Error('Failed to create app');
  }

  return app;
}

export async function getAppById(id: string): Promise<AppRow | null> {
  const db = getDatabase();

  const [app] = await db.select().from(apps).where(eq(apps.id, id)).limit(1);

  return app ?? null;
}

export async function getAppsByAccountId(accountId: string): Promise<AppRow[]> {
  const db = getDatabase();

  return db.select().from(apps).where(eq(apps.accountId, accountId)).orderBy(desc(apps.createdAt));
}

export interface AppListResult {
  apps: AppRow[];
  cursor: string | null;
  hasMore: boolean;
}

export async function getApps(options: {
  limit?: number;
  cursor?: string;
  isActive?: boolean;
}): Promise<AppListResult> {
  const db = getDatabase();
  const { limit = 50, cursor, isActive } = options;

  const conditions: ReturnType<typeof eq>[] = [];
  if (isActive !== undefined) {
    conditions.push(eq(apps.isActive, isActive));
  }

  // Apply cursor-based pagination
  addPaginationConditions(conditions, cursor, apps.createdAt, apps.id);

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Fetch limit + 1 to determine if there are more results
  const appList = await db
    .select()
    .from(apps)
    .where(whereClause)
    .orderBy(desc(apps.createdAt), desc(apps.id))
    .limit(limit + 1);

  const result = buildPaginationResult(
    appList,
    limit,
    (a) => a.createdAt,
    (a) => a.id
  );

  return {
    apps: result.items,
    cursor: result.cursor,
    hasMore: result.hasMore,
  };
}

export async function updateApp(id: string, input: UpdateAppInput): Promise<AppRow | null> {
  const db = getDatabase();

  const updateData: Partial<AppRow> = {
    updatedAt: new Date(),
  };

  if (input.name !== undefined) updateData.name = input.name;
  if (input.description !== undefined) updateData.description = input.description;
  if (input.isActive !== undefined) updateData.isActive = input.isActive;
  if (input.sandboxMode !== undefined) updateData.sandboxMode = input.sandboxMode;
  if (input.dailyLimit !== undefined) updateData.dailyLimit = input.dailyLimit;
  if (input.monthlyLimit !== undefined) updateData.monthlyLimit = input.monthlyLimit;
  if (input.settings !== undefined) updateData.settings = input.settings;

  if (input.webhookUrl !== undefined) {
    updateData.webhookUrl = input.webhookUrl;
    if (input.webhookUrl) {
      const secret = generateSecret(32);
      const encrypted = encrypt(secret, encryptionKey);
      updateData.webhookSecret = serialize(encrypted);
    } else {
      updateData.webhookSecret = null;
    }
  }

  const [updated] = await db.update(apps).set(updateData).where(eq(apps.id, id)).returning();

  return updated ?? null;
}

export async function deleteApp(id: string): Promise<boolean> {
  const db = getDatabase();

  const result = await db.delete(apps).where(eq(apps.id, id)).returning({ id: apps.id });

  return result.length > 0;
}

export async function regenerateWebhookSecret(id: string): Promise<{ secret: string } | null> {
  const db = getDatabase();

  const [app] = await db.select().from(apps).where(eq(apps.id, id)).limit(1);

  if (!app || !app.webhookUrl) {
    return null;
  }

  const secret = generateSecret(32);
  const encrypted = encrypt(secret, encryptionKey);
  const serialized = serialize(encrypted);

  await db
    .update(apps)
    .set({
      webhookSecret: serialized,
      updatedAt: new Date(),
    })
    .where(eq(apps.id, id));

  return { secret };
}
