/**
 * Worker package constants
 * Centralizes magic numbers and configuration values for better maintainability
 */

// =============================================================================
// Worker Job Retention Settings
// =============================================================================

/** Email worker - completed job retention (24 hours) */
export const EMAIL_RETENTION_COMPLETED_AGE_SECONDS = 86400;
export const EMAIL_RETENTION_COMPLETED_COUNT = 1000;

/** Email worker - failed job retention (7 days) */
export const EMAIL_RETENTION_FAILED_AGE_SECONDS = 604800;
export const EMAIL_RETENTION_FAILED_COUNT = 5000;

/** Webhook worker - completed job retention (1 hour) */
export const WEBHOOK_RETENTION_COMPLETED_AGE_SECONDS = 3600;
export const WEBHOOK_RETENTION_COMPLETED_COUNT = 500;

/** Webhook worker - failed job retention (7 days) */
export const WEBHOOK_RETENTION_FAILED_AGE_SECONDS = 604800;
export const WEBHOOK_RETENTION_FAILED_COUNT = 1000;

/** Tracking worker - completed job retention (1 hour) */
export const TRACKING_RETENTION_COMPLETED_AGE_SECONDS = 3600;
export const TRACKING_RETENTION_COMPLETED_COUNT = 10000;

/** Tracking worker - failed job retention (24 hours) */
export const TRACKING_RETENTION_FAILED_AGE_SECONDS = 86400;
export const TRACKING_RETENTION_FAILED_COUNT = 1000;

/** Analytics worker - completed job retention (1 hour) */
export const ANALYTICS_RETENTION_COMPLETED_AGE_SECONDS = 3600;
export const ANALYTICS_RETENTION_COMPLETED_COUNT = 100;

/** Analytics worker - failed job retention (24 hours) */
export const ANALYTICS_RETENTION_FAILED_AGE_SECONDS = 86400;
export const ANALYTICS_RETENTION_FAILED_COUNT = 100;

// =============================================================================
// Worker Concurrency Settings
// =============================================================================

/** Webhook worker concurrency (lower for external HTTP calls) */
export const WEBHOOK_WORKER_CONCURRENCY = 5;

/** Tracking worker concurrency (higher for fast DB operations) */
export const TRACKING_WORKER_CONCURRENCY = 10;

/** Analytics worker concurrency (low for heavy aggregation queries) */
export const ANALYTICS_WORKER_CONCURRENCY = 2;

// =============================================================================
// Reputation & Throttling Thresholds
// =============================================================================

/** Reputation score below which emails are rejected */
export const REPUTATION_SCORE_CRITICAL_THRESHOLD = 20;

/** Bounce rate percentage above which app is throttled */
export const BOUNCE_RATE_THROTTLE_THRESHOLD = 10;

/** Complaint rate percentage above which app is throttled */
export const COMPLAINT_RATE_THROTTLE_THRESHOLD = 1;

/** Points deducted per 1% bounce rate */
export const BOUNCE_RATE_SCORE_WEIGHT = 2;

/** Points deducted per 1% complaint rate */
export const COMPLAINT_RATE_SCORE_WEIGHT = 20;

// =============================================================================
// Bounce Handling
// =============================================================================

/** Days until soft bounce suppression expires */
export const SOFT_BOUNCE_EXPIRATION_DAYS = 7;

// =============================================================================
// Scheduler
// =============================================================================

/** Scheduler check interval in milliseconds (1 minute) */
export const SCHEDULER_INTERVAL_MS = 60000;
