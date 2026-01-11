import { eq, and, desc, sql, gte, lte, or, ilike } from 'drizzle-orm';
import { getDatabase, auditLogs } from '@mail-queue/db';
import { logger } from '../lib/logger.js';

export type ActorType = 'user' | 'app' | 'system';

export interface AuditLogEntry {
  id: string;
  actorType: ActorType;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  changes: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  } | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

export interface CreateAuditLogOptions {
  actorType: ActorType;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  changes?: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  };
  ipAddress?: string;
  userAgent?: string;
}

export interface ListAuditLogsOptions {
  actorId?: string;
  actorType?: ActorType;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  from?: Date;
  to?: Date;
  search?: string;
  limit?: number;
  offset?: number;
}

/**
 * Create an audit log entry
 */
export async function createAuditLog(options: CreateAuditLogOptions): Promise<AuditLogEntry> {
  const db = getDatabase();

  const [entry] = await db
    .insert(auditLogs)
    .values({
      actorType: options.actorType,
      actorId: options.actorId,
      action: options.action,
      resourceType: options.resourceType,
      resourceId: options.resourceId ?? null,
      changes: options.changes ?? null,
      ipAddress: options.ipAddress ?? null,
      userAgent: options.userAgent ?? null,
    })
    .returning();

  if (!entry) {
    throw new Error('Failed to create audit log entry');
  }

  logger.debug(
    {
      actorType: options.actorType,
      actorId: options.actorId,
      action: options.action,
      resourceType: options.resourceType,
      resourceId: options.resourceId,
    },
    'Audit log entry created'
  );

  return {
    id: entry.id,
    actorType: entry.actorType,
    actorId: entry.actorId,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    changes: entry.changes,
    ipAddress: entry.ipAddress,
    userAgent: entry.userAgent,
    createdAt: entry.createdAt,
  };
}

/**
 * List audit log entries with filtering and pagination
 */
export async function listAuditLogs(
  options: ListAuditLogsOptions
): Promise<{ entries: AuditLogEntry[]; total: number; hasMore: boolean }> {
  const {
    actorId,
    actorType,
    action,
    resourceType,
    resourceId,
    from,
    to,
    search,
    limit = 50,
    offset = 0,
  } = options;
  const db = getDatabase();

  const conditions: ReturnType<typeof eq>[] = [];

  if (actorId) {
    conditions.push(eq(auditLogs.actorId, actorId));
  }

  if (actorType) {
    conditions.push(eq(auditLogs.actorType, actorType));
  }

  if (action) {
    // Allow wildcard matching like 'email.*'
    if (action.includes('*')) {
      const pattern = action.replace(/\*/g, '%');
      conditions.push(ilike(auditLogs.action, pattern));
    } else {
      conditions.push(eq(auditLogs.action, action));
    }
  }

  if (resourceType) {
    conditions.push(eq(auditLogs.resourceType, resourceType));
  }

  if (resourceId) {
    conditions.push(eq(auditLogs.resourceId, resourceId));
  }

  if (from) {
    conditions.push(gte(auditLogs.createdAt, from));
  }

  if (to) {
    conditions.push(lte(auditLogs.createdAt, to));
  }

  if (search) {
    // Search in action or resourceType
    const searchCondition = or(
      ilike(auditLogs.action, `%${search}%`),
      ilike(auditLogs.resourceType, `%${search}%`)
    );
    if (searchCondition) {
      conditions.push(searchCondition);
    }
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [entries, countResult] = await Promise.all([
    db
      .select()
      .from(auditLogs)
      .where(whereClause)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(auditLogs).where(whereClause),
  ]);

  const total = countResult[0]?.count ?? 0;

  return {
    entries: entries.map((e) => ({
      id: e.id,
      actorType: e.actorType,
      actorId: e.actorId,
      action: e.action,
      resourceType: e.resourceType,
      resourceId: e.resourceId,
      changes: e.changes,
      ipAddress: e.ipAddress,
      userAgent: e.userAgent,
      createdAt: e.createdAt,
    })),
    total,
    hasMore: offset + entries.length < total,
  };
}

/**
 * Get a single audit log entry by ID
 */
export async function getAuditLog(id: string): Promise<AuditLogEntry | null> {
  const db = getDatabase();

  const [entry] = await db.select().from(auditLogs).where(eq(auditLogs.id, id)).limit(1);

  if (!entry) {
    return null;
  }

  return {
    id: entry.id,
    actorType: entry.actorType,
    actorId: entry.actorId,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    changes: entry.changes,
    ipAddress: entry.ipAddress,
    userAgent: entry.userAgent,
    createdAt: entry.createdAt,
  };
}

/**
 * Get audit logs for a specific resource
 */
export async function getResourceAuditTrail(
  resourceType: string,
  resourceId: string,
  limit = 50
): Promise<AuditLogEntry[]> {
  const db = getDatabase();

  const entries = await db
    .select()
    .from(auditLogs)
    .where(and(eq(auditLogs.resourceType, resourceType), eq(auditLogs.resourceId, resourceId)))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);

  return entries.map((e) => ({
    id: e.id,
    actorType: e.actorType,
    actorId: e.actorId,
    action: e.action,
    resourceType: e.resourceType,
    resourceId: e.resourceId,
    changes: e.changes,
    ipAddress: e.ipAddress,
    userAgent: e.userAgent,
    createdAt: e.createdAt,
  }));
}

/**
 * Delete old audit logs based on retention policy
 * Default retention is 1 year (365 days)
 */
export async function cleanupOldAuditLogs(retentionDays = 365): Promise<number> {
  const db = getDatabase();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  const result = await db
    .delete(auditLogs)
    .where(lte(auditLogs.createdAt, cutoffDate))
    .returning({ id: auditLogs.id });

  logger.info({ count: result.length, retentionDays }, 'Old audit logs cleaned up');

  return result.length;
}

/**
 * Helper to log common actions
 */
export const AuditActions = {
  // Authentication
  LOGIN: 'auth.login',
  LOGOUT: 'auth.logout',
  LOGIN_FAILED: 'auth.login_failed',

  // App management
  APP_CREATE: 'app.create',
  APP_UPDATE: 'app.update',
  APP_DELETE: 'app.delete',

  // API key management
  APIKEY_CREATE: 'apikey.create',
  APIKEY_REVOKE: 'apikey.revoke',
  APIKEY_ROTATE: 'apikey.rotate',

  // Queue management
  QUEUE_CREATE: 'queue.create',
  QUEUE_UPDATE: 'queue.update',
  QUEUE_DELETE: 'queue.delete',
  QUEUE_PAUSE: 'queue.pause',
  QUEUE_RESUME: 'queue.resume',

  // Email operations
  EMAIL_CREATE: 'email.create',
  EMAIL_CANCEL: 'email.cancel',
  EMAIL_RETRY: 'email.retry',
  EMAIL_DELETE: 'email.delete',

  // SMTP config
  SMTP_CREATE: 'smtp.create',
  SMTP_UPDATE: 'smtp.update',
  SMTP_DELETE: 'smtp.delete',

  // Suppression list
  SUPPRESSION_ADD: 'suppression.add',
  SUPPRESSION_REMOVE: 'suppression.remove',
  SUPPRESSION_BULK_ADD: 'suppression.bulk_add',
  SUPPRESSION_IMPORT: 'suppression.import',
  SUPPRESSION_EXPORT: 'suppression.export',

  // GDPR
  GDPR_EXPORT_REQUEST: 'gdpr.export_request',
  GDPR_EXPORT_COMPLETE: 'gdpr.export_complete',
  GDPR_DELETE_REQUEST: 'gdpr.delete_request',
  GDPR_DELETE_COMPLETE: 'gdpr.delete_complete',

  // User management
  USER_CREATE: 'user.create',
  USER_UPDATE: 'user.update',
  USER_DELETE: 'user.delete',

  // Scheduled jobs
  JOB_CREATE: 'job.create',
  JOB_UPDATE: 'job.update',
  JOB_DELETE: 'job.delete',

  // Webhook
  WEBHOOK_CREATE: 'webhook.create',
  WEBHOOK_UPDATE: 'webhook.update',
  WEBHOOK_DELETE: 'webhook.delete',
} as const;

export type AuditAction = (typeof AuditActions)[keyof typeof AuditActions];
