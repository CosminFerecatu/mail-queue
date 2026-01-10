import { eq, sql } from 'drizzle-orm';
import { getDatabase, trackingLinks, emails, emailEvents } from '@mail-queue/db';
import { type RecordTrackingJobData, QUEUE_NAMES, JOB_TYPES } from '@mail-queue/core';
import { getQueue } from '../lib/queue.js';
import { logger } from '../lib/logger.js';
import { randomBytes } from 'node:crypto';

// ===========================================
// Constants
// ===========================================

const SHORT_CODE_LENGTH = 10;
const TRACKING_PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

// ===========================================
// Types
// ===========================================

export interface CreateTrackingLinkOptions {
  emailId: string;
  originalUrl: string;
}

export interface TrackingLink {
  id: string;
  emailId: string;
  shortCode: string;
  originalUrl: string;
  clickCount: number;
  createdAt: Date;
}

export interface RecordTrackingEventOptions {
  type: 'open' | 'click';
  trackingId: string;
  linkUrl?: string;
  userAgent?: string;
  ipAddress?: string;
}

// ===========================================
// Short Code Generation
// ===========================================

function generateShortCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = randomBytes(SHORT_CODE_LENGTH);
  let result = '';

  for (let i = 0; i < SHORT_CODE_LENGTH; i++) {
    const byte = bytes[i] ?? 0;
    result += chars[byte % chars.length];
  }

  return result;
}

// ===========================================
// Create Tracking Link
// ===========================================

export async function createTrackingLink(
  options: CreateTrackingLinkOptions
): Promise<TrackingLink> {
  const { emailId, originalUrl } = options;
  const db = getDatabase();

  // Generate unique short code
  let shortCode: string;
  let attempts = 0;
  const maxAttempts = 10;

  do {
    shortCode = generateShortCode();
    const [existing] = await db
      .select({ id: trackingLinks.id })
      .from(trackingLinks)
      .where(eq(trackingLinks.shortCode, shortCode))
      .limit(1);

    if (!existing) {
      break;
    }

    attempts++;
  } while (attempts < maxAttempts);

  if (attempts >= maxAttempts) {
    throw new Error('Failed to generate unique tracking code');
  }

  // Create the tracking link
  const [link] = await db
    .insert(trackingLinks)
    .values({
      emailId,
      shortCode,
      originalUrl,
      clickCount: 0,
      createdAt: new Date(),
    })
    .returning();

  logger.debug({ emailId, shortCode, originalUrl }, 'Tracking link created');

  return {
    id: link?.id,
    emailId: link?.emailId,
    shortCode: link?.shortCode,
    originalUrl: link?.originalUrl,
    clickCount: link?.clickCount,
    createdAt: link?.createdAt,
  };
}

// ===========================================
// Get Tracking Link by Short Code
// ===========================================

export async function getTrackingLinkByShortCode(shortCode: string): Promise<TrackingLink | null> {
  const db = getDatabase();

  const [link] = await db
    .select()
    .from(trackingLinks)
    .where(eq(trackingLinks.shortCode, shortCode))
    .limit(1);

  if (!link) {
    return null;
  }

  return {
    id: link.id,
    emailId: link.emailId,
    shortCode: link.shortCode,
    originalUrl: link.originalUrl,
    clickCount: link.clickCount,
    createdAt: link.createdAt,
  };
}

// ===========================================
// Create Open Tracking ID
// ===========================================

export function createOpenTrackingId(emailId: string): string {
  // Open tracking ID is simply the email ID encoded
  // Could add additional obfuscation if needed
  return Buffer.from(emailId).toString('base64url');
}

export function decodeOpenTrackingId(trackingId: string): string | null {
  try {
    return Buffer.from(trackingId, 'base64url').toString('utf8');
  } catch {
    return null;
  }
}

// ===========================================
// Get Tracking Pixel
// ===========================================

export function getTrackingPixel(): Buffer {
  return TRACKING_PIXEL;
}

// ===========================================
// Record Tracking Event (via queue for async processing)
// ===========================================

export async function recordTrackingEvent(options: RecordTrackingEventOptions): Promise<void> {
  const { type, trackingId, linkUrl, userAgent, ipAddress } = options;

  // Determine the email ID
  let emailId: string;

  if (type === 'open') {
    const decoded = decodeOpenTrackingId(trackingId);
    if (!decoded) {
      logger.warn({ trackingId }, 'Invalid open tracking ID');
      return;
    }
    emailId = decoded;
  } else {
    // For clicks, trackingId is the short code - need to look up the email
    const link = await getTrackingLinkByShortCode(trackingId);
    if (!link) {
      logger.warn({ trackingId }, 'Tracking link not found');
      return;
    }
    emailId = link.emailId;
  }

  // Queue the tracking event for async processing
  const jobData: RecordTrackingJobData = {
    type,
    emailId,
    trackingId,
    linkUrl,
    userAgent,
    ipAddress,
    timestamp: new Date().toISOString(),
  };

  const queue = getQueue(QUEUE_NAMES.TRACKING);
  await queue.add(type === 'open' ? JOB_TYPES.RECORD_OPEN : JOB_TYPES.RECORD_CLICK, jobData);

  logger.debug({ type, emailId, trackingId }, 'Tracking event queued');
}

// ===========================================
// Process Tracking Event (called by worker)
// ===========================================

export async function processTrackingEvent(data: RecordTrackingJobData): Promise<void> {
  const { type, emailId, trackingId, linkUrl, userAgent, ipAddress, timestamp } = data;
  const db = getDatabase();

  // Verify email exists
  const [email] = await db
    .select({ id: emails.id, appId: emails.appId })
    .from(emails)
    .where(eq(emails.id, emailId))
    .limit(1);

  if (!email) {
    logger.warn({ emailId }, 'Email not found for tracking event');
    return;
  }

  if (type === 'click') {
    // Increment click count
    await db
      .update(trackingLinks)
      .set({
        clickCount: sql`${trackingLinks.clickCount} + 1`,
      })
      .where(eq(trackingLinks.shortCode, trackingId));
  }

  // Record the event
  const eventType = type === 'open' ? 'opened' : 'clicked';

  await db.insert(emailEvents).values({
    emailId,
    eventType,
    eventData: {
      linkUrl,
      userAgent,
      ipAddress,
    },
    createdAt: new Date(timestamp),
  });

  logger.info(
    {
      type,
      emailId,
      appId: email.appId,
      linkUrl,
    },
    'Tracking event recorded'
  );
}

// ===========================================
// Handle Click Redirect
// ===========================================

export async function handleClickRedirect(
  shortCode: string,
  userAgent?: string,
  ipAddress?: string
): Promise<string | null> {
  const link = await getTrackingLinkByShortCode(shortCode);

  if (!link) {
    return null;
  }

  // Record the click event asynchronously
  await recordTrackingEvent({
    type: 'click',
    trackingId: shortCode,
    linkUrl: link.originalUrl,
    userAgent,
    ipAddress,
  });

  return link.originalUrl;
}

// ===========================================
// Handle Open Tracking
// ===========================================

export async function handleOpenTracking(
  trackingId: string,
  userAgent?: string,
  ipAddress?: string
): Promise<boolean> {
  const emailId = decodeOpenTrackingId(trackingId);

  if (!emailId) {
    return false;
  }

  // Verify email exists
  const db = getDatabase();
  const [email] = await db
    .select({ id: emails.id })
    .from(emails)
    .where(eq(emails.id, emailId))
    .limit(1);

  if (!email) {
    return false;
  }

  // Record the open event asynchronously
  await recordTrackingEvent({
    type: 'open',
    trackingId,
    userAgent,
    ipAddress,
  });

  return true;
}

// ===========================================
// Rewrite HTML Links for Tracking
// ===========================================

export interface RewriteLinksResult {
  html: string;
  trackingLinks: Array<{
    shortCode: string;
    originalUrl: string;
  }>;
}

export async function rewriteHtmlLinksForTracking(
  emailId: string,
  html: string,
  trackingBaseUrl: string
): Promise<RewriteLinksResult> {
  const createdLinks: Array<{ shortCode: string; originalUrl: string }> = [];

  // Match all href attributes in anchor tags
  const linkRegex = /<a\s+([^>]*?)href=["']([^"']+)["']([^>]*)>/gi;

  const processedUrls = new Map<string, string>();

  // First pass: collect all URLs and create tracking links
  const matches: Array<{ fullMatch: string; url: string }> = [];
  let match: RegExpExecArray | null = linkRegex.exec(html);

  while (match !== null) {
    const fullMatch = match[0];
    const url = match[2];

    // Skip if url is undefined, or if it's mailto:, tel:, or anchor links
    if (!url || url.startsWith('mailto:') || url.startsWith('tel:') || url.startsWith('#')) {
      match = linkRegex.exec(html);
      continue;
    }

    // Skip already-tracked URLs
    if (url.includes('/c/')) {
      match = linkRegex.exec(html);
      continue;
    }

    matches.push({ fullMatch, url });

    // Create tracking link if not already created
    if (!processedUrls.has(url)) {
      const link = await createTrackingLink({ emailId, originalUrl: url });
      processedUrls.set(url, link.shortCode);
      createdLinks.push({ shortCode: link.shortCode, originalUrl: url });
    }

    match = linkRegex.exec(html);
  }

  // Second pass: replace URLs
  let rewrittenHtml = html;

  for (const { url } of matches) {
    const shortCode = processedUrls.get(url);
    if (shortCode) {
      const trackingUrl = `${trackingBaseUrl}/c/${shortCode}`;
      rewrittenHtml = rewrittenHtml.replace(
        new RegExp(`href=["']${escapeRegex(url)}["']`, 'g'),
        `href="${trackingUrl}"`
      );
    }
  }

  return {
    html: rewrittenHtml,
    trackingLinks: createdLinks,
  };
}

function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ===========================================
// Add Open Tracking Pixel to HTML
// ===========================================

export function addOpenTrackingPixel(
  html: string,
  emailId: string,
  trackingBaseUrl: string
): string {
  const trackingId = createOpenTrackingId(emailId);
  const pixelUrl = `${trackingBaseUrl}/t/${trackingId}/open.gif`;
  const pixelTag = `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none;visibility:hidden;" />`;

  // Add before closing body tag if exists, otherwise append
  if (html.includes('</body>')) {
    return html.replace('</body>', `${pixelTag}</body>`);
  }

  return html + pixelTag;
}

// ===========================================
// Get Tracking Links for Email
// ===========================================

export async function getTrackingLinksForEmail(emailId: string): Promise<TrackingLink[]> {
  const db = getDatabase();

  const links = await db.select().from(trackingLinks).where(eq(trackingLinks.emailId, emailId));

  return links.map((link) => ({
    id: link.id,
    emailId: link.emailId,
    shortCode: link.shortCode,
    originalUrl: link.originalUrl,
    clickCount: link.clickCount,
    createdAt: link.createdAt,
  }));
}
