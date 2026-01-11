import { eq, and, gte, lte, sql, count } from 'drizzle-orm';
import { getDatabase, emails, emailEvents, appReputation, apps, queues } from '@mail-queue/db';
import type {
  AnalyticsOverview,
  DeliveryMetrics,
  DeliveryMetricsPoint,
  EngagementMetrics,
  EngagementMetricsPoint,
  BounceBreakdown,
  ReputationScore,
} from '@mail-queue/core';
import { logger } from '../lib/logger.js';

// ===========================================
// Global Analytics Overview (for dashboard admins)
// ===========================================

export interface GetGlobalAnalyticsOverviewOptions {
  from: Date;
  to: Date;
}

export async function getGlobalAnalyticsOverview(
  options: GetGlobalAnalyticsOverviewOptions
): Promise<{
  totalEmailsToday: number;
  totalEmailsMonth: number;
  deliveryRate: number;
  bounceRate: number;
  openRate: number;
  clickRate: number;
  activeApps: number;
  activeQueues: number;
  pendingEmails: number;
  processingEmails: number;
}> {
  const { from, to } = options;
  const db = getDatabase();

  // Get today's date range
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  // Get this month's date range
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  // Get total emails today
  const [todayResult] = await db
    .select({ count: count() })
    .from(emails)
    .where(and(gte(emails.createdAt, todayStart), lte(emails.createdAt, todayEnd)));

  const totalEmailsToday = todayResult?.count ?? 0;

  // Get total emails this month
  const [monthResult] = await db
    .select({ count: count() })
    .from(emails)
    .where(and(gte(emails.createdAt, monthStart), lte(emails.createdAt, to)));

  const totalEmailsMonth = monthResult?.count ?? 0;

  // Get status counts for rate calculations
  const statusCounts = await db
    .select({
      status: emails.status,
      count: count(),
    })
    .from(emails)
    .where(and(gte(emails.createdAt, from), lte(emails.createdAt, to)))
    .groupBy(emails.status);

  let sent = 0;
  let delivered = 0;
  let bounced = 0;
  let pending = 0;
  let processing = 0;

  for (const row of statusCounts) {
    switch (row.status) {
      case 'sent':
        sent = row.count;
        break;
      case 'delivered':
        delivered = row.count;
        break;
      case 'bounced':
        bounced = row.count;
        break;
      case 'queued':
        pending = row.count;
        break;
      case 'processing':
        processing = row.count;
        break;
    }
  }

  const totalSent = sent + delivered;
  const deliveryRate = totalSent > 0 ? (delivered / totalSent) * 100 : 0;
  const bounceRate = totalSent > 0 ? (bounced / totalSent) * 100 : 0;

  // Get engagement metrics
  const engagementCounts = await db
    .select({
      eventType: emailEvents.eventType,
      count: count(),
    })
    .from(emailEvents)
    .where(
      and(
        gte(emailEvents.createdAt, from),
        lte(emailEvents.createdAt, to),
        sql`${emailEvents.eventType} IN ('opened', 'clicked')`
      )
    )
    .groupBy(emailEvents.eventType);

  let opened = 0;
  let clicked = 0;

  for (const row of engagementCounts) {
    if (row.eventType === 'opened') opened = row.count;
    if (row.eventType === 'clicked') clicked = row.count;
  }

  const openRate = delivered > 0 ? (opened / delivered) * 100 : 0;
  const clickRate = delivered > 0 ? (clicked / delivered) * 100 : 0;

  // Get active apps count
  const [appsResult] = await db
    .select({ count: count() })
    .from(apps)
    .where(eq(apps.isActive, true));

  const activeApps = appsResult?.count ?? 0;

  // Get active queues count
  const [queuesResult] = await db
    .select({ count: count() })
    .from(queues)
    .where(eq(queues.isPaused, false));

  const activeQueues = queuesResult?.count ?? 0;

  return {
    totalEmailsToday,
    totalEmailsMonth,
    deliveryRate: Math.round(deliveryRate * 100) / 100,
    bounceRate: Math.round(bounceRate * 100) / 100,
    openRate: Math.round(openRate * 100) / 100,
    clickRate: Math.round(clickRate * 100) / 100,
    activeApps,
    activeQueues,
    pendingEmails: pending,
    processingEmails: processing,
  };
}

// ===========================================
// Analytics Overview
// ===========================================

export interface GetAnalyticsOverviewOptions {
  appId: string;
  from: Date;
  to: Date;
  queueId?: string;
}

export async function getAnalyticsOverview(
  options: GetAnalyticsOverviewOptions
): Promise<AnalyticsOverview> {
  const { appId, from, to, queueId } = options;
  const db = getDatabase();

  // Build conditions
  const conditions = [
    eq(emails.appId, appId),
    gte(emails.createdAt, from),
    lte(emails.createdAt, to),
  ];

  if (queueId) {
    conditions.push(eq(emails.queueId, queueId));
  }

  // Get totals by status
  const statusCounts = await db
    .select({
      status: emails.status,
      count: count(),
    })
    .from(emails)
    .where(and(...conditions))
    .groupBy(emails.status);

  const totals = {
    sent: 0,
    delivered: 0,
    bounced: 0,
    complained: 0,
    failed: 0,
  };

  for (const row of statusCounts) {
    switch (row.status) {
      case 'sent':
        totals.sent = row.count;
        break;
      case 'delivered':
        totals.delivered = row.count;
        totals.sent += row.count; // Delivered emails were also sent
        break;
      case 'bounced':
        totals.bounced = row.count;
        break;
      case 'failed':
        totals.failed = row.count;
        break;
    }
  }

  // Get complaint count from events
  const [complaintResult] = await db
    .select({ count: count() })
    .from(emailEvents)
    .innerJoin(emails, eq(emailEvents.emailId, emails.id))
    .where(
      and(
        eq(emails.appId, appId),
        eq(emailEvents.eventType, 'complained'),
        gte(emailEvents.createdAt, from),
        lte(emailEvents.createdAt, to)
      )
    );

  totals.complained = complaintResult?.count ?? 0;

  // Calculate rates
  const totalSent = totals.sent + totals.delivered;
  const rates = {
    deliveryRate: totalSent > 0 ? (totals.delivered / totalSent) * 100 : 0,
    bounceRate: totalSent > 0 ? (totals.bounced / totalSent) * 100 : 0,
    complaintRate: totalSent > 0 ? (totals.complained / totalSent) * 100 : 0,
  };

  // Get current queue status
  const queueConditions = [eq(emails.appId, appId)];
  if (queueId) {
    queueConditions.push(eq(emails.queueId, queueId));
  }

  const queueCounts = await db
    .select({
      status: emails.status,
      count: count(),
    })
    .from(emails)
    .where(and(...queueConditions, sql`${emails.status} IN ('queued', 'processing')`))
    .groupBy(emails.status);

  const queueStatus = {
    pending: 0,
    processing: 0,
  };

  for (const row of queueCounts) {
    if (row.status === 'queued') {
      queueStatus.pending = row.count;
    } else if (row.status === 'processing') {
      queueStatus.processing = row.count;
    }
  }

  return {
    period: {
      from: from.toISOString(),
      to: to.toISOString(),
    },
    totals,
    rates,
    queues: queueStatus,
  };
}

// ===========================================
// Delivery Metrics
// ===========================================

export interface GetDeliveryMetricsOptions {
  appId?: string;
  from: Date;
  to: Date;
  queueId?: string;
  granularity: 'minute' | 'hour' | 'day';
}

export async function getDeliveryMetrics(
  options: GetDeliveryMetricsOptions
): Promise<DeliveryMetrics> {
  const { appId, from, to, queueId, granularity } = options;
  const db = getDatabase();

  // Determine the date truncation based on granularity
  const dateTrunc = granularity === 'minute' ? 'minute' : granularity === 'hour' ? 'hour' : 'day';

  // Define the date_trunc expression once and reuse it to ensure PostgreSQL recognizes it as the same expression
  const dateTruncExpr = sql`date_trunc(${sql.raw(`'${dateTrunc}'`)}, ${emails.createdAt})`;

  const conditions: ReturnType<typeof eq>[] = [
    gte(emails.createdAt, from),
    lte(emails.createdAt, to),
  ];

  if (appId) {
    conditions.push(eq(emails.appId, appId));
  }

  if (queueId) {
    conditions.push(eq(emails.queueId, queueId));
  }

  // Get time-series data
  const timeSeriesData = await db
    .select({
      timestamp: sql<string>`${dateTruncExpr}::text`,
      status: emails.status,
      count: count(),
    })
    .from(emails)
    .where(and(...conditions))
    .groupBy(dateTruncExpr, emails.status)
    .orderBy(dateTruncExpr);

  // Aggregate by timestamp
  const dataMap = new Map<string, DeliveryMetricsPoint>();

  for (const row of timeSeriesData) {
    const ts = row.timestamp;
    if (!dataMap.has(ts)) {
      dataMap.set(ts, {
        timestamp: new Date(ts).toISOString(),
        sent: 0,
        delivered: 0,
        bounced: 0,
        failed: 0,
      });
    }

    const point = dataMap.get(ts);
    if (!point) continue;

    switch (row.status) {
      case 'sent':
        point.sent = row.count;
        break;
      case 'delivered':
        point.delivered = row.count;
        point.sent += row.count;
        break;
      case 'bounced':
        point.bounced = row.count;
        break;
      case 'failed':
        point.failed = row.count;
        break;
    }
  }

  const data = Array.from(dataMap.values());

  // Calculate totals
  const totals = data.reduce(
    (acc, point) => ({
      sent: acc.sent + point.sent,
      delivered: acc.delivered + point.delivered,
      bounced: acc.bounced + point.bounced,
      failed: acc.failed + point.failed,
    }),
    { sent: 0, delivered: 0, bounced: 0, failed: 0 }
  );

  return {
    period: {
      from: from.toISOString(),
      to: to.toISOString(),
    },
    granularity,
    data,
    totals,
  };
}

// ===========================================
// Engagement Metrics
// ===========================================

export interface GetEngagementMetricsOptions {
  appId?: string;
  from: Date;
  to: Date;
  queueId?: string;
  granularity: 'minute' | 'hour' | 'day';
}

export async function getEngagementMetrics(
  options: GetEngagementMetricsOptions
): Promise<EngagementMetrics> {
  const { appId, from, to, queueId, granularity } = options;
  const db = getDatabase();

  const dateTrunc = granularity === 'minute' ? 'minute' : granularity === 'hour' ? 'hour' : 'day';

  // Define the date_trunc expression once and reuse it to ensure PostgreSQL recognizes it as the same expression
  const dateTruncExpr = sql`date_trunc(${sql.raw(`'${dateTrunc}'`)}, ${emailEvents.createdAt})`;

  // Base conditions for email events joined with emails
  const eventConditions: ReturnType<typeof eq>[] = [
    gte(emailEvents.createdAt, from),
    lte(emailEvents.createdAt, to),
  ];

  if (appId) {
    eventConditions.push(eq(emails.appId, appId));
  }

  if (queueId) {
    eventConditions.push(eq(emails.queueId, queueId));
  }

  // Get engagement events time-series
  const timeSeriesData = await db
    .select({
      timestamp: sql<string>`${dateTruncExpr}::text`,
      eventType: emailEvents.eventType,
      count: count(),
    })
    .from(emailEvents)
    .innerJoin(emails, eq(emailEvents.emailId, emails.id))
    .where(
      and(
        ...eventConditions,
        sql`${emailEvents.eventType} IN ('delivered', 'opened', 'clicked', 'unsubscribed')`
      )
    )
    .groupBy(dateTruncExpr, emailEvents.eventType)
    .orderBy(dateTruncExpr);

  // Aggregate by timestamp
  const dataMap = new Map<string, EngagementMetricsPoint>();

  for (const row of timeSeriesData) {
    const ts = row.timestamp;
    if (!dataMap.has(ts)) {
      dataMap.set(ts, {
        timestamp: new Date(ts).toISOString(),
        delivered: 0,
        opened: 0,
        clicked: 0,
        unsubscribed: 0,
      });
    }

    const point = dataMap.get(ts);
    if (!point) continue;

    switch (row.eventType) {
      case 'delivered':
        point.delivered = row.count;
        break;
      case 'opened':
        point.opened = row.count;
        break;
      case 'clicked':
        point.clicked = row.count;
        break;
      case 'unsubscribed':
        point.unsubscribed = row.count;
        break;
    }
  }

  const data = Array.from(dataMap.values());

  // Calculate totals
  const totals = data.reduce(
    (acc, point) => ({
      delivered: acc.delivered + point.delivered,
      opened: acc.opened + point.opened,
      clicked: acc.clicked + point.clicked,
      unsubscribed: acc.unsubscribed + point.unsubscribed,
    }),
    { delivered: 0, opened: 0, clicked: 0, unsubscribed: 0 }
  );

  // Calculate rates
  const rates = {
    openRate: totals.delivered > 0 ? (totals.opened / totals.delivered) * 100 : 0,
    clickRate: totals.delivered > 0 ? (totals.clicked / totals.delivered) * 100 : 0,
    unsubscribeRate: totals.delivered > 0 ? (totals.unsubscribed / totals.delivered) * 100 : 0,
  };

  return {
    period: {
      from: from.toISOString(),
      to: to.toISOString(),
    },
    granularity,
    data,
    totals,
    rates,
  };
}

// ===========================================
// Bounce Breakdown
// ===========================================

export interface GetBounceBreakdownOptions {
  appId?: string;
  from: Date;
  to: Date;
  queueId?: string;
}

export async function getBounceBreakdown(
  options: GetBounceBreakdownOptions
): Promise<BounceBreakdown> {
  const { appId, from, to, queueId } = options;
  const db = getDatabase();

  const conditions: ReturnType<typeof eq>[] = [
    eq(emailEvents.eventType, 'bounced'),
    gte(emailEvents.createdAt, from),
    lte(emailEvents.createdAt, to),
  ];

  if (appId) {
    conditions.push(eq(emails.appId, appId));
  }

  if (queueId) {
    conditions.push(eq(emails.queueId, queueId));
  }

  // Get bounce events with data
  const bounceEvents = await db
    .select({
      eventData: emailEvents.eventData,
      toAddresses: emails.toAddresses,
    })
    .from(emailEvents)
    .innerJoin(emails, eq(emailEvents.emailId, emails.id))
    .where(and(...conditions));

  // Aggregate bounce data
  let hardBounces = 0;
  let softBounces = 0;
  const reasonCounts = new Map<string, number>();
  const domainCounts = new Map<string, number>();

  for (const event of bounceEvents) {
    const data = event.eventData as { bounceType?: string; bounceSubType?: string } | null;

    // Count by type
    if (data?.bounceType === 'hard') {
      hardBounces++;
    } else {
      softBounces++;
    }

    // Count by reason
    const reason = data?.bounceSubType ?? 'unknown';
    reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);

    // Count by domain
    const toAddresses = event.toAddresses as Array<{ email: string }>;
    for (const addr of toAddresses) {
      const domain = addr.email.split('@')[1]?.toLowerCase() ?? 'unknown';
      domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1);
    }
  }

  const totalBounces = hardBounces + softBounces;

  // Format by reason
  const byReason = Array.from(reasonCounts.entries())
    .map(([reason, count]) => ({
      reason,
      count,
      percentage: totalBounces > 0 ? (count / totalBounces) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Format top domains
  const topBouncedDomains = Array.from(domainCounts.entries())
    .map(([domain, count]) => ({
      domain,
      count,
      percentage: totalBounces > 0 ? (count / totalBounces) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    period: {
      from: from.toISOString(),
      to: to.toISOString(),
    },
    totalBounces,
    byType: {
      hard: hardBounces,
      soft: softBounces,
    },
    byReason,
    topBouncedDomains,
  };
}

// ===========================================
// Reputation Score
// ===========================================

export async function getReputationScore(appId: string): Promise<ReputationScore> {
  const db = getDatabase();

  const [reputation] = await db
    .select()
    .from(appReputation)
    .where(eq(appReputation.appId, appId))
    .limit(1);

  // Default reputation if none exists
  if (!reputation) {
    return {
      appId,
      score: 100,
      bounceRate24h: 0,
      complaintRate24h: 0,
      isThrottled: false,
      throttleReason: null,
      updatedAt: new Date(),
      recommendations: [],
    };
  }

  // Generate recommendations based on metrics
  const recommendations: string[] = [];
  const bounceRate = Number.parseFloat(reputation.bounceRate24h ?? '0');
  const complaintRate = Number.parseFloat(reputation.complaintRate24h ?? '0');

  if (bounceRate > 5) {
    recommendations.push(
      'High bounce rate detected. Clean your email list and verify addresses before sending.'
    );
  }
  if (bounceRate > 2 && bounceRate <= 5) {
    recommendations.push('Bounce rate is elevated. Consider implementing email verification.');
  }
  if (complaintRate > 0.5) {
    recommendations.push('High complaint rate. Review your opt-in process and sending frequency.');
  }
  if (complaintRate > 0.1 && complaintRate <= 0.5) {
    recommendations.push(
      'Complaint rate is elevated. Ensure recipients have opted in to receive emails.'
    );
  }
  if (reputation.isThrottled) {
    recommendations.push(`Sending is throttled: ${reputation.throttleReason}`);
  }

  return {
    appId,
    score: Number.parseFloat(reputation.reputationScore ?? '100'),
    bounceRate24h: bounceRate,
    complaintRate24h: complaintRate,
    isThrottled: reputation.isThrottled,
    throttleReason: reputation.throttleReason,
    updatedAt: reputation.updatedAt,
    recommendations,
  };
}

// ===========================================
// Update Reputation (called by worker)
// ===========================================

export interface UpdateReputationResult {
  appId: string;
  previousScore: number;
  newScore: number;
  isThrottled: boolean;
}

export async function updateAppReputation(appId: string): Promise<UpdateReputationResult> {
  const db = getDatabase();

  // Calculate 24h metrics
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Get sent count in last 24h
  const [sentResult] = await db
    .select({ count: count() })
    .from(emails)
    .where(
      and(
        eq(emails.appId, appId),
        gte(emails.createdAt, yesterday),
        sql`${emails.status} IN ('sent', 'delivered', 'bounced')`
      )
    );

  const sentCount = sentResult?.count ?? 0;

  // Get bounce count in last 24h
  const [bounceResult] = await db
    .select({ count: count() })
    .from(emails)
    .where(
      and(eq(emails.appId, appId), eq(emails.status, 'bounced'), gte(emails.createdAt, yesterday))
    );

  const bounceCount = bounceResult?.count ?? 0;

  // Get complaint count in last 24h
  const [complaintResult] = await db
    .select({ count: count() })
    .from(emailEvents)
    .innerJoin(emails, eq(emailEvents.emailId, emails.id))
    .where(
      and(
        eq(emails.appId, appId),
        eq(emailEvents.eventType, 'complained'),
        gte(emailEvents.createdAt, yesterday)
      )
    );

  const complaintCount = complaintResult?.count ?? 0;

  // Calculate rates
  const bounceRate = sentCount > 0 ? (bounceCount / sentCount) * 100 : 0;
  const complaintRate = sentCount > 0 ? (complaintCount / sentCount) * 100 : 0;

  // Calculate reputation score (simple formula)
  // Start at 100, subtract based on bounce and complaint rates
  let score = 100;
  score -= bounceRate * 2; // Each 1% bounce = -2 points
  score -= complaintRate * 20; // Each 1% complaint = -20 points
  score = Math.max(0, Math.min(100, score));

  // Determine throttling
  const isThrottled = bounceRate > 10 || complaintRate > 1;
  let throttleReason: string | null = null;

  if (bounceRate > 10) {
    throttleReason = `Bounce rate too high: ${bounceRate.toFixed(2)}%`;
  } else if (complaintRate > 1) {
    throttleReason = `Complaint rate too high: ${complaintRate.toFixed(2)}%`;
  }

  // Get previous score
  const [existing] = await db
    .select({ score: appReputation.reputationScore })
    .from(appReputation)
    .where(eq(appReputation.appId, appId))
    .limit(1);

  const previousScore = Number.parseFloat(existing?.score ?? '100');

  // Upsert reputation
  await db
    .insert(appReputation)
    .values({
      appId,
      bounceRate24h: bounceRate.toFixed(2),
      complaintRate24h: complaintRate.toFixed(2),
      reputationScore: score.toFixed(2),
      isThrottled,
      throttleReason,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [appReputation.appId],
      set: {
        bounceRate24h: bounceRate.toFixed(2),
        complaintRate24h: complaintRate.toFixed(2),
        reputationScore: score.toFixed(2),
        isThrottled,
        throttleReason,
        updatedAt: now,
      },
    });

  logger.info(
    {
      appId,
      bounceRate: bounceRate.toFixed(2),
      complaintRate: complaintRate.toFixed(2),
      score: score.toFixed(2),
      isThrottled,
    },
    'App reputation updated'
  );

  return {
    appId,
    previousScore,
    newScore: score,
    isThrottled,
  };
}
