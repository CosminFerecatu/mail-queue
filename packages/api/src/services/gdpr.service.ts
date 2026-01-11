import { eq, and, desc, sql, or, inArray, lt } from 'drizzle-orm';
import {
  getDatabase,
  emails,
  emailEvents,
  suppressionList,
  gdprRequests,
  trackingLinks,
} from '@mail-queue/db';
import { logger } from '../lib/logger.js';
import { addToSuppressionList } from './suppression.service.js';
import { parseCursor, buildPaginationResult } from '../lib/cursor.js';

export type GdprRequestType = 'export' | 'delete' | 'rectify' | 'access';
export type GdprRequestStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface GdprRequest {
  id: string;
  appId: string | null;
  emailAddress: string;
  requestType: GdprRequestType;
  status: GdprRequestStatus;
  requestedBy: string;
  metadata: {
    reason?: string;
    verificationMethod?: string;
    verificationReference?: string;
    notes?: string;
  } | null;
  result: {
    filePath?: string;
    fileUrl?: string;
    expiresAt?: string;
    recordsAffected?: number;
    error?: string;
    errorDetails?: string;
  } | null;
  processedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateGdprRequestOptions {
  appId?: string;
  emailAddress: string;
  requestType: GdprRequestType;
  requestedBy: string;
  metadata?: {
    reason?: string;
    verificationMethod?: string;
    verificationReference?: string;
    notes?: string;
  };
}

export interface ListGdprRequestsOptions {
  appId?: string;
  emailAddress?: string;
  requestType?: GdprRequestType;
  status?: GdprRequestStatus;
  limit?: number;
  cursor?: string;
}

export interface GdprRequestListResult {
  requests: GdprRequest[];
  cursor: string | null;
  hasMore: boolean;
}

export interface ExportedData {
  dataSubject: {
    emailAddress: string;
    exportedAt: string;
    appId: string | null;
  };
  emails: Array<{
    id: string;
    from: string;
    to: string[];
    cc: string[] | null;
    bcc: string[] | null;
    subject: string;
    status: string;
    scheduledAt: string | null;
    sentAt: string | null;
    deliveredAt: string | null;
    createdAt: string;
    metadata: Record<string, unknown> | null;
    events: Array<{
      eventType: string;
      eventData: Record<string, unknown> | null;
      createdAt: string;
    }>;
  }>;
  suppressionEntries: Array<{
    id: string;
    reason: string;
    expiresAt: string | null;
    createdAt: string;
  }>;
  trackingData: Array<{
    emailId: string;
    originalUrl: string;
    clickCount: number;
    createdAt: string;
  }>;
  summary: {
    totalEmails: number;
    totalEvents: number;
    totalSuppressionEntries: number;
    totalTrackingLinks: number;
  };
}

/**
 * Create a new GDPR request
 */
export async function createGdprRequest(options: CreateGdprRequestOptions): Promise<GdprRequest> {
  const db = getDatabase();
  const normalizedEmail = options.emailAddress.toLowerCase().trim();

  const [request] = await db
    .insert(gdprRequests)
    .values({
      appId: options.appId ?? null,
      emailAddress: normalizedEmail,
      requestType: options.requestType,
      requestedBy: options.requestedBy,
      metadata: options.metadata ?? null,
    })
    .returning();

  if (!request) {
    throw new Error('Failed to create GDPR request');
  }

  logger.info(
    {
      requestId: request.id,
      emailAddress: normalizedEmail,
      requestType: options.requestType,
    },
    'GDPR request created'
  );

  return mapGdprRequest(request);
}

/**
 * Get a GDPR request by ID
 */
export async function getGdprRequest(id: string): Promise<GdprRequest | null> {
  const db = getDatabase();

  const [request] = await db.select().from(gdprRequests).where(eq(gdprRequests.id, id)).limit(1);

  if (!request) {
    return null;
  }

  return mapGdprRequest(request);
}

/**
 * List GDPR requests with filtering
 */
export async function listGdprRequests(
  options: ListGdprRequestsOptions
): Promise<GdprRequestListResult> {
  const { appId, emailAddress, requestType, status, limit = 50, cursor } = options;
  const db = getDatabase();

  const conditions: ReturnType<typeof eq>[] = [];

  if (appId) {
    conditions.push(eq(gdprRequests.appId, appId));
  }

  if (emailAddress) {
    const normalizedEmail = emailAddress.toLowerCase().trim();
    conditions.push(eq(gdprRequests.emailAddress, normalizedEmail));
  }

  if (requestType) {
    conditions.push(eq(gdprRequests.requestType, requestType));
  }

  if (status) {
    conditions.push(eq(gdprRequests.status, status));
  }

  // Apply cursor-based pagination
  const cursorData = parseCursor(cursor);
  if (cursorData) {
    const cursorDate = new Date(cursorData.c);
    conditions.push(
      or(
        lt(gdprRequests.createdAt, cursorDate),
        and(eq(gdprRequests.createdAt, cursorDate), lt(gdprRequests.id, cursorData.i))
      )!
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Fetch limit + 1 to determine if there are more results
  const requestList = await db
    .select()
    .from(gdprRequests)
    .where(whereClause)
    .orderBy(desc(gdprRequests.createdAt), desc(gdprRequests.id))
    .limit(limit + 1);

  const mappedRequests = requestList.map(mapGdprRequest);

  const result = buildPaginationResult(
    mappedRequests,
    limit,
    (r) => r.createdAt,
    (r) => r.id
  );

  return {
    requests: result.items,
    cursor: result.cursor,
    hasMore: result.hasMore,
  };
}

/**
 * Update GDPR request status
 */
export async function updateGdprRequestStatus(
  id: string,
  status: GdprRequestStatus,
  result?: GdprRequest['result']
): Promise<GdprRequest | null> {
  const db = getDatabase();

  const updateData: Record<string, unknown> = {
    status,
    updatedAt: new Date(),
  };

  if (status === 'processing') {
    updateData['processedAt'] = new Date();
  }

  if (status === 'completed' || status === 'failed') {
    updateData['completedAt'] = new Date();
  }

  if (result) {
    updateData['result'] = result;
  }

  const [updated] = await db
    .update(gdprRequests)
    .set(updateData)
    .where(eq(gdprRequests.id, id))
    .returning();

  if (!updated) {
    return null;
  }

  logger.info({ requestId: id, status }, 'GDPR request status updated');

  return mapGdprRequest(updated);
}

/**
 * Export all data for an email address (Right of Access / Data Portability)
 */
export async function exportDataForEmail(
  appId: string | null,
  emailAddress: string
): Promise<ExportedData> {
  const db = getDatabase();
  const normalizedEmail = emailAddress.toLowerCase().trim();

  // Find all emails where this address appears in to, cc, bcc, or from
  const emailConditions = appId
    ? and(
        eq(emails.appId, appId),
        or(
          eq(emails.fromAddress, normalizedEmail),
          sql`${emails.toAddresses}::text ILIKE ${`%${normalizedEmail}%`}`,
          sql`${emails.cc}::text ILIKE ${`%${normalizedEmail}%`}`,
          sql`${emails.bcc}::text ILIKE ${`%${normalizedEmail}%`}`
        )
      )
    : or(
        eq(emails.fromAddress, normalizedEmail),
        sql`${emails.toAddresses}::text ILIKE ${`%${normalizedEmail}%`}`,
        sql`${emails.cc}::text ILIKE ${`%${normalizedEmail}%`}`,
        sql`${emails.bcc}::text ILIKE ${`%${normalizedEmail}%`}`
      );

  const emailRecords = await db
    .select()
    .from(emails)
    .where(emailConditions)
    .orderBy(desc(emails.createdAt));

  // Get all events for these emails
  const emailIds = emailRecords.map((e) => e.id);
  const eventRecords =
    emailIds.length > 0
      ? await db
          .select()
          .from(emailEvents)
          .where(inArray(emailEvents.emailId, emailIds))
          .orderBy(desc(emailEvents.createdAt))
      : [];

  // Get suppression entries
  const suppressionConditions = appId
    ? and(
        eq(suppressionList.emailAddress, normalizedEmail),
        or(eq(suppressionList.appId, appId), sql`${suppressionList.appId} IS NULL`)
      )
    : eq(suppressionList.emailAddress, normalizedEmail);

  const suppressionRecords = await db.select().from(suppressionList).where(suppressionConditions);

  // Get tracking links for these emails
  const trackingRecords =
    emailIds.length > 0
      ? await db.select().from(trackingLinks).where(inArray(trackingLinks.emailId, emailIds))
      : [];

  // Group events by email ID
  const eventsByEmailId = new Map<string, typeof eventRecords>();
  for (const event of eventRecords) {
    const existing = eventsByEmailId.get(event.emailId) ?? [];
    existing.push(event);
    eventsByEmailId.set(event.emailId, existing);
  }

  // Build export data
  const exportedData: ExportedData = {
    dataSubject: {
      emailAddress: normalizedEmail,
      exportedAt: new Date().toISOString(),
      appId,
    },
    emails: emailRecords.map((email) => ({
      id: email.id,
      from: email.fromAddress,
      to: (email.toAddresses as Array<{ email: string; name?: string }>).map((a) => a.email),
      cc: email.cc
        ? (email.cc as Array<{ email: string; name?: string }>).map((a) => a.email)
        : null,
      bcc: email.bcc
        ? (email.bcc as Array<{ email: string; name?: string }>).map((a) => a.email)
        : null,
      subject: email.subject,
      status: email.status,
      scheduledAt: email.scheduledAt?.toISOString() ?? null,
      sentAt: email.sentAt?.toISOString() ?? null,
      deliveredAt: email.deliveredAt?.toISOString() ?? null,
      createdAt: email.createdAt.toISOString(),
      metadata: email.metadata,
      events: (eventsByEmailId.get(email.id) ?? []).map((event) => ({
        eventType: event.eventType,
        eventData: event.eventData,
        createdAt: event.createdAt.toISOString(),
      })),
    })),
    suppressionEntries: suppressionRecords.map((s) => ({
      id: s.id,
      reason: s.reason,
      expiresAt: s.expiresAt?.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
    })),
    trackingData: trackingRecords.map((t) => ({
      emailId: t.emailId,
      originalUrl: t.originalUrl,
      clickCount: t.clickCount,
      createdAt: t.createdAt.toISOString(),
    })),
    summary: {
      totalEmails: emailRecords.length,
      totalEvents: eventRecords.length,
      totalSuppressionEntries: suppressionRecords.length,
      totalTrackingLinks: trackingRecords.length,
    },
  };

  logger.info(
    {
      emailAddress: normalizedEmail,
      appId,
      emailCount: emailRecords.length,
      eventCount: eventRecords.length,
    },
    'Data exported for email address'
  );

  return exportedData;
}

/**
 * Delete all data for an email address (Right to Erasure / Right to be Forgotten)
 */
export async function deleteDataForEmail(
  appId: string | null,
  emailAddress: string,
  options: {
    addToSuppression?: boolean;
    suppressionReason?: 'manual' | 'unsubscribe';
  } = {}
): Promise<{
  emailsDeleted: number;
  eventsDeleted: number;
  trackingLinksDeleted: number;
  suppressionEntriesDeleted: number;
}> {
  const db = getDatabase();
  const normalizedEmail = emailAddress.toLowerCase().trim();
  const { addToSuppression = true, suppressionReason = 'manual' } = options;

  // Find all emails where this address appears
  const emailConditions = appId
    ? and(
        eq(emails.appId, appId),
        or(
          eq(emails.fromAddress, normalizedEmail),
          sql`${emails.toAddresses}::text ILIKE ${`%${normalizedEmail}%`}`,
          sql`${emails.cc}::text ILIKE ${`%${normalizedEmail}%`}`,
          sql`${emails.bcc}::text ILIKE ${`%${normalizedEmail}%`}`
        )
      )
    : or(
        eq(emails.fromAddress, normalizedEmail),
        sql`${emails.toAddresses}::text ILIKE ${`%${normalizedEmail}%`}`,
        sql`${emails.cc}::text ILIKE ${`%${normalizedEmail}%`}`,
        sql`${emails.bcc}::text ILIKE ${`%${normalizedEmail}%`}`
      );

  const emailRecords = await db.select({ id: emails.id }).from(emails).where(emailConditions);

  const emailIds = emailRecords.map((e) => e.id);

  // Delete tracking links first (foreign key constraint)
  let trackingLinksDeleted = 0;
  if (emailIds.length > 0) {
    const trackingResult = await db
      .delete(trackingLinks)
      .where(inArray(trackingLinks.emailId, emailIds))
      .returning({ id: trackingLinks.id });
    trackingLinksDeleted = trackingResult.length;
  }

  // Delete events (cascade should handle this, but be explicit)
  let eventsDeleted = 0;
  if (emailIds.length > 0) {
    const eventsResult = await db
      .delete(emailEvents)
      .where(inArray(emailEvents.emailId, emailIds))
      .returning({ id: emailEvents.id });
    eventsDeleted = eventsResult.length;
  }

  // Delete emails
  let emailsDeleted = 0;
  if (emailIds.length > 0) {
    const emailsResult = await db
      .delete(emails)
      .where(inArray(emails.id, emailIds))
      .returning({ id: emails.id });
    emailsDeleted = emailsResult.length;
  }

  // Delete suppression entries
  const suppressionConditions = appId
    ? and(
        eq(suppressionList.emailAddress, normalizedEmail),
        or(eq(suppressionList.appId, appId), sql`${suppressionList.appId} IS NULL`)
      )
    : eq(suppressionList.emailAddress, normalizedEmail);

  const suppressionResult = await db
    .delete(suppressionList)
    .where(suppressionConditions)
    .returning({ id: suppressionList.id });
  const suppressionEntriesDeleted = suppressionResult.length;

  // Add to suppression list to prevent future emails (GDPR best practice)
  if (addToSuppression && appId) {
    await addToSuppressionList({
      appId,
      emailAddress: normalizedEmail,
      reason: suppressionReason,
    });
  }

  logger.info(
    {
      emailAddress: normalizedEmail,
      appId,
      emailsDeleted,
      eventsDeleted,
      trackingLinksDeleted,
      suppressionEntriesDeleted,
    },
    'Data deleted for email address (GDPR erasure)'
  );

  return {
    emailsDeleted,
    eventsDeleted,
    trackingLinksDeleted,
    suppressionEntriesDeleted,
  };
}

/**
 * Anonymize data for an email address instead of deleting
 * This replaces PII with anonymized values while keeping records for analytics
 */
export async function anonymizeDataForEmail(
  appId: string | null,
  emailAddress: string
): Promise<{
  emailsAnonymized: number;
}> {
  const db = getDatabase();
  const normalizedEmail = emailAddress.toLowerCase().trim();
  const anonymizedEmail = `anonymized_${Date.now()}@redacted.local`;

  // Find all emails where this address appears
  const emailConditions = appId
    ? and(
        eq(emails.appId, appId),
        or(
          eq(emails.fromAddress, normalizedEmail),
          sql`${emails.toAddresses}::text ILIKE ${`%${normalizedEmail}%`}`,
          sql`${emails.cc}::text ILIKE ${`%${normalizedEmail}%`}`,
          sql`${emails.bcc}::text ILIKE ${`%${normalizedEmail}%`}`
        )
      )
    : or(
        eq(emails.fromAddress, normalizedEmail),
        sql`${emails.toAddresses}::text ILIKE ${`%${normalizedEmail}%`}`,
        sql`${emails.cc}::text ILIKE ${`%${normalizedEmail}%`}`,
        sql`${emails.bcc}::text ILIKE ${`%${normalizedEmail}%`}`
      );

  // Update from address
  const fromResult = await db
    .update(emails)
    .set({ fromAddress: anonymizedEmail, fromName: 'Anonymized' })
    .where(and(emailConditions, eq(emails.fromAddress, normalizedEmail)))
    .returning({ id: emails.id });

  // For to/cc/bcc we need to update JSONB arrays - this is more complex
  // We'll use a raw SQL update for this
  await db.execute(sql`
    UPDATE emails
    SET to_addresses = (
      SELECT jsonb_agg(
        CASE
          WHEN elem->>'email' ILIKE ${normalizedEmail}
          THEN jsonb_set(elem, '{email}', ${`"${anonymizedEmail}"`}::jsonb)
          ELSE elem
        END
      )
      FROM jsonb_array_elements(to_addresses) elem
    )
    WHERE ${emailConditions}
    AND to_addresses::text ILIKE ${`%${normalizedEmail}%`}
  `);

  logger.info(
    {
      emailAddress: normalizedEmail,
      appId,
      emailsAnonymized: fromResult.length,
    },
    'Data anonymized for email address'
  );

  return {
    emailsAnonymized: fromResult.length,
  };
}

/**
 * Process a GDPR request
 */
export async function processGdprRequest(requestId: string): Promise<GdprRequest | null> {
  const request = await getGdprRequest(requestId);
  if (!request) {
    return null;
  }

  // Update to processing
  await updateGdprRequestStatus(requestId, 'processing');

  try {
    let result: GdprRequest['result'];

    switch (request.requestType) {
      case 'export':
      case 'access': {
        const exportData = await exportDataForEmail(request.appId, request.emailAddress);
        result = {
          recordsAffected:
            exportData.summary.totalEmails +
            exportData.summary.totalEvents +
            exportData.summary.totalSuppressionEntries,
          // In a real implementation, you'd save to file storage and provide a URL
          // For now, we'll just note that export was completed
        };
        break;
      }

      case 'delete': {
        const deleteResult = await deleteDataForEmail(request.appId, request.emailAddress);
        result = {
          recordsAffected:
            deleteResult.emailsDeleted +
            deleteResult.eventsDeleted +
            deleteResult.trackingLinksDeleted +
            deleteResult.suppressionEntriesDeleted,
        };
        break;
      }

      case 'rectify': {
        // Rectification requires specific data changes, handled separately
        result = {
          error: 'Rectification requests require manual processing',
        };
        return await updateGdprRequestStatus(requestId, 'failed', result);
      }
    }

    return await updateGdprRequestStatus(requestId, 'completed', result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error, requestId }, 'Failed to process GDPR request');

    return await updateGdprRequestStatus(requestId, 'failed', {
      error: 'Processing failed',
      errorDetails: errorMessage,
    });
  }
}

/**
 * Cancel a pending GDPR request
 */
export async function cancelGdprRequest(requestId: string): Promise<GdprRequest | null> {
  const request = await getGdprRequest(requestId);
  if (!request) {
    return null;
  }

  if (request.status !== 'pending') {
    throw new Error('Only pending requests can be cancelled');
  }

  return await updateGdprRequestStatus(requestId, 'cancelled');
}

// Helper function to map database row to GdprRequest type
function mapGdprRequest(row: {
  id: string;
  appId: string | null;
  emailAddress: string;
  requestType: GdprRequestType;
  status: GdprRequestStatus;
  requestedBy: string;
  metadata: GdprRequest['metadata'];
  result: GdprRequest['result'];
  processedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): GdprRequest {
  return {
    id: row.id,
    appId: row.appId,
    emailAddress: row.emailAddress,
    requestType: row.requestType,
    status: row.status,
    requestedBy: row.requestedBy,
    metadata: row.metadata,
    result: row.result,
    processedAt: row.processedAt,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
