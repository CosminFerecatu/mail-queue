import { eq, desc, and, sql } from 'drizzle-orm';
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

const encryptionKey = parseEncryptionKey(config.encryptionKey);

export interface AppWithStats extends AppRow {
  emailCount?: number;
  queueCount?: number;
}

export async function createApp(input: CreateAppInput): Promise<AppRow> {
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

export async function getApps(options: {
  limit?: number;
  offset?: number;
  isActive?: boolean;
}): Promise<{ apps: AppRow[]; total: number }> {
  const db = getDatabase();
  const { limit = 50, offset = 0, isActive } = options;

  const conditions = [];
  if (isActive !== undefined) {
    conditions.push(eq(apps.isActive, isActive));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [appList, countResult] = await Promise.all([
    db
      .select()
      .from(apps)
      .where(whereClause)
      .orderBy(desc(apps.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(apps)
      .where(whereClause),
  ]);

  return {
    apps: appList,
    total: countResult[0]?.count ?? 0,
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
