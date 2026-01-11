import { eq, and, desc, lt, or } from 'drizzle-orm';
import nodemailer from 'nodemailer';
import { getDatabase, smtpConfigs, type SmtpConfigRow } from '@mail-queue/db';
import {
  type CreateSmtpConfigInput,
  type UpdateSmtpConfigInput,
  encrypt,
  decrypt,
  serialize,
  deserialize,
  parseEncryptionKey,
} from '@mail-queue/core';
import { config } from '../config.js';
import { parseCursor, buildPaginationResult } from '../lib/cursor.js';

export interface SmtpConfigListResult {
  configs: SmtpConfigRow[];
  cursor: string | null;
  hasMore: boolean;
}

const encryptionKey = parseEncryptionKey(config.encryptionKey);

export async function createSmtpConfig(
  appId: string,
  input: CreateSmtpConfigInput
): Promise<SmtpConfigRow> {
  const db = getDatabase();

  let encryptedPassword: string | null = null;
  if (input.password) {
    const encrypted = encrypt(input.password, encryptionKey);
    encryptedPassword = serialize(encrypted);
  }

  const [smtpConfig] = await db
    .insert(smtpConfigs)
    .values({
      appId,
      name: input.name,
      host: input.host,
      port: input.port,
      username: input.username ?? null,
      password: encryptedPassword,
      encryption: input.encryption ?? 'tls',
      poolSize: input.poolSize ?? 5,
      timeoutMs: input.timeoutMs ?? 30000,
    })
    .returning();

  if (!smtpConfig) {
    throw new Error('Failed to create SMTP config');
  }

  return smtpConfig;
}

export async function getSmtpConfigById(id: string, appId: string): Promise<SmtpConfigRow | null> {
  const db = getDatabase();

  const [smtpConfig] = await db
    .select()
    .from(smtpConfigs)
    .where(and(eq(smtpConfigs.id, id), eq(smtpConfigs.appId, appId)))
    .limit(1);

  return smtpConfig ?? null;
}

export async function getSmtpConfigsByAppId(
  appId: string,
  options: { limit?: number; cursor?: string } = {}
): Promise<SmtpConfigListResult> {
  const db = getDatabase();
  const { limit = 50, cursor } = options;

  const conditions = [eq(smtpConfigs.appId, appId)];

  // Apply cursor-based pagination
  const cursorData = parseCursor(cursor);
  if (cursorData) {
    const cursorDate = new Date(cursorData.c);
    const paginationCondition = or(
      lt(smtpConfigs.createdAt, cursorDate),
      and(eq(smtpConfigs.createdAt, cursorDate), lt(smtpConfigs.id, cursorData.i))
    );
    if (paginationCondition) {
      conditions.push(paginationCondition);
    }
  }

  // Fetch limit + 1 to determine if there are more results
  const configList = await db
    .select()
    .from(smtpConfigs)
    .where(and(...conditions))
    .orderBy(desc(smtpConfigs.createdAt), desc(smtpConfigs.id))
    .limit(limit + 1);

  const result = buildPaginationResult(
    configList,
    limit,
    (c) => c.createdAt,
    (c) => c.id
  );

  return {
    configs: result.items,
    cursor: result.cursor,
    hasMore: result.hasMore,
  };
}

export async function updateSmtpConfig(
  id: string,
  appId: string,
  input: UpdateSmtpConfigInput
): Promise<SmtpConfigRow | null> {
  const db = getDatabase();

  const updateData: Partial<SmtpConfigRow> = {
    updatedAt: new Date(),
  };

  if (input.name !== undefined) updateData.name = input.name;
  if (input.host !== undefined) updateData.host = input.host;
  if (input.port !== undefined) updateData.port = input.port;
  if (input.username !== undefined) updateData.username = input.username;
  if (input.encryption !== undefined) updateData.encryption = input.encryption;
  if (input.poolSize !== undefined) updateData.poolSize = input.poolSize;
  if (input.timeoutMs !== undefined) updateData.timeoutMs = input.timeoutMs;

  if (input.password !== undefined) {
    if (input.password) {
      const encrypted = encrypt(input.password, encryptionKey);
      updateData.password = serialize(encrypted);
    } else {
      updateData.password = null;
    }
  }

  const [updated] = await db
    .update(smtpConfigs)
    .set(updateData)
    .where(and(eq(smtpConfigs.id, id), eq(smtpConfigs.appId, appId)))
    .returning();

  return updated ?? null;
}

export async function deleteSmtpConfig(id: string, appId: string): Promise<boolean> {
  const db = getDatabase();

  const result = await db
    .delete(smtpConfigs)
    .where(and(eq(smtpConfigs.id, id), eq(smtpConfigs.appId, appId)))
    .returning({ id: smtpConfigs.id });

  return result.length > 0;
}

export async function setSmtpConfigActive(
  id: string,
  appId: string,
  isActive: boolean
): Promise<boolean> {
  const db = getDatabase();

  const result = await db
    .update(smtpConfigs)
    .set({ isActive, updatedAt: new Date() })
    .where(and(eq(smtpConfigs.id, id), eq(smtpConfigs.appId, appId)))
    .returning({ id: smtpConfigs.id });

  return result.length > 0;
}

export interface SmtpTestResult {
  success: boolean;
  message: string;
  details?: {
    responseTime: number;
    serverInfo?: string;
  };
}

export async function testSmtpConfig(id: string, appId: string): Promise<SmtpTestResult | null> {
  const db = getDatabase();

  const [smtpConfig] = await db
    .select()
    .from(smtpConfigs)
    .where(and(eq(smtpConfigs.id, id), eq(smtpConfigs.appId, appId)))
    .limit(1);

  if (!smtpConfig) {
    return null;
  }

  // Decrypt password if present
  let password: string | undefined;
  if (smtpConfig.password) {
    try {
      const encrypted = deserialize(smtpConfig.password);
      password = decrypt(encrypted, encryptionKey);
    } catch {
      return {
        success: false,
        message: 'Failed to decrypt SMTP password',
      };
    }
  }

  // Create transporter
  const transporter = nodemailer.createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.encryption === 'tls',
    auth:
      smtpConfig.username && password
        ? {
            user: smtpConfig.username,
            pass: password,
          }
        : undefined,
    connectionTimeout: smtpConfig.timeoutMs,
  });

  // Test connection
  const startTime = Date.now();
  try {
    await transporter.verify();
    const responseTime = Date.now() - startTime;

    return {
      success: true,
      message: 'SMTP connection successful',
      details: {
        responseTime,
        serverInfo: `${smtpConfig.host}:${smtpConfig.port}`,
      },
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return {
      success: false,
      message: `SMTP connection failed: ${errorMessage}`,
      details: {
        responseTime,
      },
    };
  } finally {
    transporter.close();
  }
}

export function formatSmtpConfigResponse(config: SmtpConfigRow): Omit<SmtpConfigRow, 'password'> {
  const { password, ...rest } = config;
  return rest;
}
