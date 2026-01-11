import { eq, and, lte, inArray, sql } from 'drizzle-orm';
import {
  getDatabase,
  emails,
  emailEvents,
  trackingLinks,
  apps,
  auditLogs,
  gdprRequests,
  webhookDeliveries,
} from '@mail-queue/db';
import { logger } from '../lib/logger.js';
import { cleanupExpiredSuppressions } from './suppression.service.js';

export interface RetentionPolicy {
  appId: string;
  appName: string;
  retentionDays: number;
}

export interface CleanupResult {
  appId: string;
  appName: string;
  emailsDeleted: number;
  eventsDeleted: number;
  trackingLinksDeleted: number;
  cutoffDate: Date;
}

export interface GlobalCleanupResult {
  appsProcessed: number;
  totalEmailsDeleted: number;
  totalEventsDeleted: number;
  totalTrackingLinksDeleted: number;
  auditLogsDeleted: number;
  expiredSuppressionsDeleted: number;
  webhookDeliveriesDeleted: number;
  gdprRequestsCleaned: number;
  results: CleanupResult[];
}

const DEFAULT_RETENTION_DAYS = 90;
const AUDIT_LOG_RETENTION_DAYS = 365; // 1 year for compliance
const WEBHOOK_DELIVERY_RETENTION_DAYS = 30;
const GDPR_REQUEST_RETENTION_DAYS = 365 * 3; // 3 years for GDPR compliance

/**
 * Get retention policies for all apps
 */
export async function getRetentionPolicies(): Promise<RetentionPolicy[]> {
  const db = getDatabase();

  const appList = await db
    .select({
      id: apps.id,
      name: apps.name,
      settings: apps.settings,
    })
    .from(apps)
    .where(eq(apps.isActive, true));

  return appList.map((app) => ({
    appId: app.id,
    appName: app.name,
    retentionDays:
      (app.settings as { retentionDays?: number })?.retentionDays ?? DEFAULT_RETENTION_DAYS,
  }));
}

/**
 * Get retention policy for a specific app
 */
export async function getAppRetentionPolicy(appId: string): Promise<RetentionPolicy | null> {
  const db = getDatabase();

  const [app] = await db
    .select({
      id: apps.id,
      name: apps.name,
      settings: apps.settings,
    })
    .from(apps)
    .where(eq(apps.id, appId))
    .limit(1);

  if (!app) {
    return null;
  }

  return {
    appId: app.id,
    appName: app.name,
    retentionDays:
      (app.settings as { retentionDays?: number })?.retentionDays ?? DEFAULT_RETENTION_DAYS,
  };
}

/**
 * Update retention policy for an app
 */
export async function updateAppRetentionPolicy(
  appId: string,
  retentionDays: number
): Promise<boolean> {
  const db = getDatabase();

  // Get current settings
  const [app] = await db
    .select({ settings: apps.settings })
    .from(apps)
    .where(eq(apps.id, appId))
    .limit(1);

  if (!app) {
    return false;
  }

  // Merge with existing settings
  const currentSettings = (app.settings as Record<string, unknown>) ?? {};
  const newSettings = {
    ...currentSettings,
    retentionDays,
  };

  await db
    .update(apps)
    .set({
      settings: newSettings,
      updatedAt: new Date(),
    })
    .where(eq(apps.id, appId));

  logger.info({ appId, retentionDays }, 'App retention policy updated');

  return true;
}

/**
 * Cleanup old emails for a specific app based on retention policy
 */
export async function cleanupAppEmails(
  appId: string,
  retentionDays: number
): Promise<CleanupResult> {
  const db = getDatabase();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  // Get app name for logging
  const [app] = await db.select({ name: apps.name }).from(apps).where(eq(apps.id, appId)).limit(1);

  const appName = app?.name ?? 'Unknown';

  // Find emails to delete
  const emailsToDelete = await db
    .select({ id: emails.id })
    .from(emails)
    .where(and(eq(emails.appId, appId), lte(emails.createdAt, cutoffDate)));

  const emailIds = emailsToDelete.map((e) => e.id);

  if (emailIds.length === 0) {
    return {
      appId,
      appName,
      emailsDeleted: 0,
      eventsDeleted: 0,
      trackingLinksDeleted: 0,
      cutoffDate,
    };
  }

  // Delete in batches to avoid overwhelming the database
  const batchSize = 1000;
  let totalEmailsDeleted = 0;
  let totalEventsDeleted = 0;
  let totalTrackingLinksDeleted = 0;

  for (let i = 0; i < emailIds.length; i += batchSize) {
    const batch = emailIds.slice(i, i + batchSize);

    // Delete tracking links first (foreign key)
    const trackingResult = await db
      .delete(trackingLinks)
      .where(inArray(trackingLinks.emailId, batch))
      .returning({ id: trackingLinks.id });
    totalTrackingLinksDeleted += trackingResult.length;

    // Delete events (cascade should handle, but be explicit)
    const eventsResult = await db
      .delete(emailEvents)
      .where(inArray(emailEvents.emailId, batch))
      .returning({ id: emailEvents.id });
    totalEventsDeleted += eventsResult.length;

    // Delete emails
    const emailsResult = await db
      .delete(emails)
      .where(inArray(emails.id, batch))
      .returning({ id: emails.id });
    totalEmailsDeleted += emailsResult.length;
  }

  logger.info(
    {
      appId,
      appName,
      retentionDays,
      emailsDeleted: totalEmailsDeleted,
      eventsDeleted: totalEventsDeleted,
      trackingLinksDeleted: totalTrackingLinksDeleted,
      cutoffDate: cutoffDate.toISOString(),
    },
    'App email cleanup completed'
  );

  return {
    appId,
    appName,
    emailsDeleted: totalEmailsDeleted,
    eventsDeleted: totalEventsDeleted,
    trackingLinksDeleted: totalTrackingLinksDeleted,
    cutoffDate,
  };
}

/**
 * Cleanup old audit logs
 */
export async function cleanupAuditLogs(retentionDays = AUDIT_LOG_RETENTION_DAYS): Promise<number> {
  const db = getDatabase();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  const result = await db
    .delete(auditLogs)
    .where(lte(auditLogs.createdAt, cutoffDate))
    .returning({ id: auditLogs.id });

  logger.info(
    { count: result.length, retentionDays, cutoffDate: cutoffDate.toISOString() },
    'Audit logs cleanup completed'
  );

  return result.length;
}

/**
 * Cleanup old webhook deliveries
 */
export async function cleanupWebhookDeliveries(
  retentionDays = WEBHOOK_DELIVERY_RETENTION_DAYS
): Promise<number> {
  const db = getDatabase();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  const result = await db
    .delete(webhookDeliveries)
    .where(lte(webhookDeliveries.createdAt, cutoffDate))
    .returning({ id: webhookDeliveries.id });

  logger.info(
    { count: result.length, retentionDays, cutoffDate: cutoffDate.toISOString() },
    'Webhook deliveries cleanup completed'
  );

  return result.length;
}

/**
 * Cleanup old completed GDPR requests (keep for compliance period)
 */
export async function cleanupGdprRequests(
  retentionDays = GDPR_REQUEST_RETENTION_DAYS
): Promise<number> {
  const db = getDatabase();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  // Only delete completed or cancelled requests older than retention period
  const result = await db
    .delete(gdprRequests)
    .where(
      and(
        lte(gdprRequests.createdAt, cutoffDate),
        sql`${gdprRequests.status} IN ('completed', 'cancelled')`
      )
    )
    .returning({ id: gdprRequests.id });

  logger.info(
    { count: result.length, retentionDays, cutoffDate: cutoffDate.toISOString() },
    'GDPR requests cleanup completed'
  );

  return result.length;
}

/**
 * Run global cleanup for all apps and system data
 */
export async function runGlobalCleanup(): Promise<GlobalCleanupResult> {
  const startTime = Date.now();
  logger.info('Starting global retention cleanup');

  // Get all retention policies
  const policies = await getRetentionPolicies();

  // Cleanup emails for each app
  const results: CleanupResult[] = [];
  for (const policy of policies) {
    try {
      const result = await cleanupAppEmails(policy.appId, policy.retentionDays);
      results.push(result);
    } catch (error) {
      logger.error({ error, appId: policy.appId }, 'Failed to cleanup app emails');
    }
  }

  // Cleanup system data
  const auditLogsDeleted = await cleanupAuditLogs();
  const webhookDeliveriesDeleted = await cleanupWebhookDeliveries();
  const expiredSuppressionsDeleted = await cleanupExpiredSuppressions();
  const gdprRequestsCleaned = await cleanupGdprRequests();

  // Calculate totals
  const totalEmailsDeleted = results.reduce((sum, r) => sum + r.emailsDeleted, 0);
  const totalEventsDeleted = results.reduce((sum, r) => sum + r.eventsDeleted, 0);
  const totalTrackingLinksDeleted = results.reduce((sum, r) => sum + r.trackingLinksDeleted, 0);

  const duration = Date.now() - startTime;
  logger.info(
    {
      duration,
      appsProcessed: policies.length,
      totalEmailsDeleted,
      totalEventsDeleted,
      totalTrackingLinksDeleted,
      auditLogsDeleted,
      webhookDeliveriesDeleted,
      expiredSuppressionsDeleted,
      gdprRequestsCleaned,
    },
    'Global retention cleanup completed'
  );

  return {
    appsProcessed: policies.length,
    totalEmailsDeleted,
    totalEventsDeleted,
    totalTrackingLinksDeleted,
    auditLogsDeleted,
    expiredSuppressionsDeleted,
    webhookDeliveriesDeleted,
    gdprRequestsCleaned,
    results,
  };
}

/**
 * Get retention statistics for an app
 */
export async function getRetentionStats(appId: string): Promise<{
  policy: RetentionPolicy | null;
  emailsBeforeCutoff: number;
  eventsBeforeCutoff: number;
  estimatedDeletionSize: number;
}> {
  const db = getDatabase();

  const policy = await getAppRetentionPolicy(appId);
  if (!policy) {
    return {
      policy: null,
      emailsBeforeCutoff: 0,
      eventsBeforeCutoff: 0,
      estimatedDeletionSize: 0,
    };
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - policy.retentionDays);

  const [emailCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(emails)
    .where(and(eq(emails.appId, appId), lte(emails.createdAt, cutoffDate)));

  // Get email IDs to count events
  const emailIds = await db
    .select({ id: emails.id })
    .from(emails)
    .where(and(eq(emails.appId, appId), lte(emails.createdAt, cutoffDate)))
    .limit(10000); // Limit for performance

  let eventCount = 0;
  if (emailIds.length > 0) {
    const [eventResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(emailEvents)
      .where(
        inArray(
          emailEvents.emailId,
          emailIds.map((e) => e.id)
        )
      );
    eventCount = eventResult?.count ?? 0;
  }

  return {
    policy,
    emailsBeforeCutoff: emailCount?.count ?? 0,
    eventsBeforeCutoff: eventCount,
    estimatedDeletionSize: emailIds.length,
  };
}
