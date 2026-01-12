import bcrypt from 'bcrypt';
import { eq, and, desc } from 'drizzle-orm';
import { getDatabase, apiKeys, apps, type ApiKeyRow } from '@mail-queue/db';
import { type CreateApiKeyInput, type ApiKeyScope, generateApiKey } from '@mail-queue/core';
import { buildPaginationResult } from '../lib/cursor.js';
import { addPaginationConditions } from '../lib/pagination.js';

export interface ApiKeyListResult {
  keys: ApiKeyRow[];
  cursor: string | null;
  hasMore: boolean;
}

/**
 * Response interface for API key data returned by API endpoints.
 * Excludes sensitive fields like keyHash.
 */
export interface ApiKeyResponse {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  rateLimit: number | null;
  ipAllowlist: string[] | null;
  expiresAt: Date | null;
  isActive: boolean;
  createdAt: Date;
  lastUsedAt: Date | null;
}

/**
 * Formats an API key row for API response, excluding sensitive fields.
 */
export function formatApiKeyResponse(key: ApiKeyRow): ApiKeyResponse {
  return {
    id: key.id,
    name: key.name,
    keyPrefix: key.keyPrefix,
    scopes: key.scopes as string[],
    rateLimit: key.rateLimit,
    ipAllowlist: key.ipAllowlist as string[] | null,
    expiresAt: key.expiresAt,
    isActive: key.isActive,
    createdAt: key.createdAt,
    lastUsedAt: key.lastUsedAt,
  };
}

const BCRYPT_ROUNDS = 12;

export interface ApiKeyWithApp extends ApiKeyRow {
  app: {
    id: string;
    name: string;
    isActive: boolean;
    sandboxMode: boolean;
    dailyLimit: number | null;
    monthlyLimit: number | null;
  };
}

export async function createApiKey(
  appId: string,
  input: CreateApiKeyInput,
  isSandbox = false
): Promise<{ apiKey: ApiKeyRow; plainKey: string }> {
  const db = getDatabase();

  const prefix = isSandbox ? 'mq_test' : 'mq_live';
  const { key, prefix: keyPrefix } = generateApiKey(prefix);

  const keyHash = await bcrypt.hash(key, BCRYPT_ROUNDS);

  const [apiKey] = await db
    .insert(apiKeys)
    .values({
      appId,
      name: input.name,
      keyPrefix,
      keyHash,
      scopes: input.scopes,
      rateLimit: input.rateLimit ?? null,
      ipAllowlist: input.ipAllowlist ?? null,
      expiresAt: input.expiresAt ?? null,
    })
    .returning();

  if (!apiKey) {
    throw new Error('Failed to create API key');
  }

  return { apiKey, plainKey: key };
}

export async function getApiKeyById(id: string, appId: string): Promise<ApiKeyRow | null> {
  const db = getDatabase();

  const [key] = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.id, id), eq(apiKeys.appId, appId)))
    .limit(1);

  return key ?? null;
}

export async function getApiKeysByAppId(
  appId: string,
  options: { limit?: number; cursor?: string; isActive?: boolean } = {}
): Promise<ApiKeyListResult> {
  const db = getDatabase();
  const { limit = 50, cursor, isActive } = options;

  const conditions: ReturnType<typeof eq>[] = [eq(apiKeys.appId, appId)];
  if (isActive !== undefined) {
    conditions.push(eq(apiKeys.isActive, isActive));
  }

  // Apply cursor-based pagination
  addPaginationConditions(conditions, cursor, apiKeys.createdAt, apiKeys.id);

  // Fetch limit + 1 to determine if there are more results
  const keyList = await db
    .select()
    .from(apiKeys)
    .where(and(...conditions))
    .orderBy(desc(apiKeys.createdAt), desc(apiKeys.id))
    .limit(limit + 1);

  const result = buildPaginationResult(
    keyList,
    limit,
    (k) => k.createdAt,
    (k) => k.id
  );

  return {
    keys: result.items,
    cursor: result.cursor,
    hasMore: result.hasMore,
  };
}

export async function validateApiKey(plainKey: string): Promise<ApiKeyWithApp | null> {
  const db = getDatabase();

  // Extract prefix to narrow down candidates (e.g., "mq_live_xxxx")
  const keyParts = plainKey.split('_');
  if (keyParts.length < 3) {
    return null;
  }
  const prefixPattern = `${keyParts[0]}_${keyParts[1]}_${keyParts[2]?.substring(0, 4)}`;

  // Find keys with matching prefix
  const now = new Date();
  const candidates = await db
    .select({
      key: apiKeys,
      app: {
        id: apps.id,
        name: apps.name,
        isActive: apps.isActive,
        sandboxMode: apps.sandboxMode,
        dailyLimit: apps.dailyLimit,
        monthlyLimit: apps.monthlyLimit,
      },
    })
    .from(apiKeys)
    .innerJoin(apps, eq(apiKeys.appId, apps.id))
    .where(
      and(eq(apiKeys.keyPrefix, prefixPattern), eq(apiKeys.isActive, true), eq(apps.isActive, true))
    )
    .limit(10); // Limit candidates for safety

  // Verify hash for each candidate
  for (const candidate of candidates) {
    const isValid = await bcrypt.compare(plainKey, candidate.key.keyHash);
    if (isValid) {
      // Check expiration
      if (candidate.key.expiresAt && candidate.key.expiresAt < now) {
        return null;
      }

      // Update last used timestamp (fire and forget)
      db.update(apiKeys)
        .set({ lastUsedAt: now })
        .where(eq(apiKeys.id, candidate.key.id))
        .catch(() => {}); // Ignore errors

      return {
        ...candidate.key,
        app: candidate.app,
      };
    }
  }

  return null;
}

export async function revokeApiKey(id: string, appId: string): Promise<boolean> {
  const db = getDatabase();

  const result = await db
    .update(apiKeys)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.appId, appId)))
    .returning({ id: apiKeys.id });

  return result.length > 0;
}

export async function deleteApiKey(id: string, appId: string): Promise<boolean> {
  const db = getDatabase();

  const result = await db
    .delete(apiKeys)
    .where(and(eq(apiKeys.id, id), eq(apiKeys.appId, appId)))
    .returning({ id: apiKeys.id });

  return result.length > 0;
}

export async function rotateApiKey(
  id: string,
  appId: string
): Promise<{ apiKey: ApiKeyRow; plainKey: string } | null> {
  const db = getDatabase();

  // Get existing key
  const [existing] = await db
    .select()
    .from(apiKeys)
    .innerJoin(apps, eq(apiKeys.appId, apps.id))
    .where(and(eq(apiKeys.id, id), eq(apiKeys.appId, appId)))
    .limit(1);

  if (!existing) {
    return null;
  }

  const isSandbox = existing.apps.sandboxMode;
  const prefix = isSandbox ? 'mq_test' : 'mq_live';
  const { key, prefix: keyPrefix } = generateApiKey(prefix);
  const keyHash = await bcrypt.hash(key, BCRYPT_ROUNDS);

  const [updated] = await db
    .update(apiKeys)
    .set({
      keyPrefix,
      keyHash,
      updatedAt: new Date(),
    })
    .where(eq(apiKeys.id, id))
    .returning();

  if (!updated) {
    return null;
  }

  return { apiKey: updated, plainKey: key };
}

export function hasScope(apiKey: ApiKeyRow, requiredScope: ApiKeyScope): boolean {
  const scopes = apiKey.scopes as ApiKeyScope[];

  // Admin scope has access to everything
  if (scopes.includes('admin')) {
    return true;
  }

  return scopes.includes(requiredScope);
}

export function hasAnyScope(apiKey: ApiKeyRow, requiredScopes: ApiKeyScope[]): boolean {
  return requiredScopes.some((scope) => hasScope(apiKey, scope));
}

export function checkIpAllowlist(apiKey: ApiKeyRow, clientIp: string): boolean {
  const allowlist = apiKey.ipAllowlist as string[] | null;

  if (!allowlist || allowlist.length === 0) {
    return true; // No restriction
  }

  // TODO(enhancement): Add CIDR notation support for IP allowlist
  // Currently only exact IP matches are supported.
  // CIDR support would allow entries like "192.168.1.0/24" or "10.0.0.0/8"
  // Consider using a library like 'ip-cidr' or 'netmask' for implementation.
  // See: https://github.com/your-org/mail-queue/issues/XXX
  return allowlist.includes(clientIp);
}
