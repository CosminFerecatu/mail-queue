/**
 * BullMQ queue definitions and job types
 */

import type { JobsOptions } from 'bullmq';

// ===========================================
// Queue Names
// ===========================================

export const QUEUE_NAMES = {
  EMAIL: 'email',
  WEBHOOK: 'webhook',
  TRACKING: 'tracking',
  BOUNCE: 'bounce',
  SCHEDULED: 'scheduled',
  ANALYTICS: 'analytics',
  CLEANUP: 'cleanup',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// ===========================================
// Job Types
// ===========================================

export const JOB_TYPES = {
  // Email jobs
  SEND_EMAIL: 'send-email',
  SEND_BATCH_EMAIL: 'send-batch-email',

  // Webhook jobs
  DELIVER_WEBHOOK: 'deliver-webhook',

  // Tracking jobs
  RECORD_OPEN: 'record-open',
  RECORD_CLICK: 'record-click',

  // Bounce jobs
  PROCESS_BOUNCE: 'process-bounce',
  UPDATE_REPUTATION: 'update-reputation',

  // Scheduled jobs
  PROCESS_SCHEDULED: 'process-scheduled',
  PROCESS_RECURRING: 'process-recurring',

  // Analytics jobs
  AGGREGATE_STATS: 'aggregate-stats',

  // Cleanup jobs
  CLEANUP_OLD_EMAILS: 'cleanup-old-emails',
  CLEANUP_OLD_EVENTS: 'cleanup-old-events',
  CLEANUP_TRACKING_LINKS: 'cleanup-tracking-links',
} as const;

export type JobType = (typeof JOB_TYPES)[keyof typeof JOB_TYPES];

// ===========================================
// Job Data Types
// ===========================================

export interface SendEmailJobData {
  emailId: string;
  appId: string;
  queueId: string;
  priority: number;
  attempt?: number;
}

export interface SendBatchEmailJobData {
  batchId: string;
  appId: string;
  queueId: string;
  emailIds: string[];
  priority: number;
}

export interface DeliverWebhookJobData {
  webhookDeliveryId: string;
  appId: string;
  webhookUrl: string;
  webhookSecret: string;
  payload: Record<string, unknown>;
  attempt?: number;
}

export interface RecordTrackingJobData {
  type: 'open' | 'click';
  emailId: string;
  trackingId: string;
  linkUrl?: string;
  userAgent?: string;
  ipAddress?: string;
  timestamp: string;
}

export interface ProcessBounceJobData {
  emailId: string;
  appId: string;
  bounceType: 'hard' | 'soft';
  bounceSubType?: string;
  bounceMessage?: string;
  bouncedAddress: string;
  timestamp: string;
}

export interface UpdateReputationJobData {
  appId: string;
}

export interface ProcessScheduledJobData {
  emailId: string;
}

export interface ProcessRecurringJobData {
  scheduledJobId: string;
}

export interface AggregateStatsJobData {
  appId?: string;
  period: 'hourly' | 'daily';
  timestamp: string;
}

export interface CleanupJobData {
  type: 'emails' | 'events' | 'tracking_links';
  retentionDays: number;
  batchSize: number;
}

// ===========================================
// Job Data Union Type
// ===========================================

export type JobData =
  | SendEmailJobData
  | SendBatchEmailJobData
  | DeliverWebhookJobData
  | RecordTrackingJobData
  | ProcessBounceJobData
  | UpdateReputationJobData
  | ProcessScheduledJobData
  | ProcessRecurringJobData
  | AggregateStatsJobData
  | CleanupJobData;

// ===========================================
// Default Job Options
// ===========================================

export const DEFAULT_JOB_OPTIONS: Record<QueueName, Partial<JobsOptions>> = {
  [QUEUE_NAMES.EMAIL]: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 30000, // 30 seconds
    },
    removeOnComplete: {
      age: 86400, // 24 hours
      count: 1000,
    },
    removeOnFail: {
      age: 604800, // 7 days
      count: 5000,
    },
  },
  [QUEUE_NAMES.WEBHOOK]: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 60000, // 1 minute
    },
    removeOnComplete: {
      age: 3600, // 1 hour
      count: 500,
    },
    removeOnFail: {
      age: 604800, // 7 days
      count: 1000,
    },
  },
  [QUEUE_NAMES.TRACKING]: {
    attempts: 3,
    backoff: {
      type: 'fixed',
      delay: 5000,
    },
    removeOnComplete: {
      age: 3600,
      count: 10000,
    },
    removeOnFail: {
      age: 86400,
      count: 1000,
    },
  },
  [QUEUE_NAMES.BOUNCE]: {
    attempts: 3,
    backoff: {
      type: 'fixed',
      delay: 10000,
    },
    removeOnComplete: {
      age: 86400,
      count: 1000,
    },
    removeOnFail: {
      age: 604800,
      count: 500,
    },
  },
  [QUEUE_NAMES.SCHEDULED]: {
    attempts: 3,
    backoff: {
      type: 'fixed',
      delay: 60000,
    },
    removeOnComplete: {
      age: 86400,
      count: 500,
    },
    removeOnFail: {
      age: 604800,
      count: 500,
    },
  },
  [QUEUE_NAMES.ANALYTICS]: {
    attempts: 3,
    backoff: {
      type: 'fixed',
      delay: 60000,
    },
    removeOnComplete: {
      age: 3600,
      count: 100,
    },
    removeOnFail: {
      age: 86400,
      count: 100,
    },
  },
  [QUEUE_NAMES.CLEANUP]: {
    attempts: 3,
    backoff: {
      type: 'fixed',
      delay: 300000, // 5 minutes
    },
    removeOnComplete: {
      age: 86400,
      count: 50,
    },
    removeOnFail: {
      age: 604800,
      count: 50,
    },
  },
};

// ===========================================
// Priority Levels
// ===========================================

export const PRIORITY_LEVELS = {
  CRITICAL: 1,
  HIGH: 3,
  NORMAL: 5,
  LOW: 7,
  BULK: 10,
} as const;

export type PriorityLevel = (typeof PRIORITY_LEVELS)[keyof typeof PRIORITY_LEVELS];

/**
 * Convert queue priority (1-10) to BullMQ priority
 * BullMQ uses lower numbers = higher priority
 */
export function queuePriorityToBullMQ(queuePriority: number): number {
  // Queue priority: 1-10 where 10 is highest
  // BullMQ priority: 1-∞ where 1 is highest
  return 11 - Math.max(1, Math.min(10, queuePriority));
}

// ===========================================
// Rate Limiter Config
// ===========================================

export interface RateLimiterConfig {
  max: number; // Maximum number of jobs
  duration: number; // Time window in milliseconds
}

export function createRateLimiterConfig(emailsPerMinute: number): RateLimiterConfig {
  return {
    max: emailsPerMinute,
    duration: 60000, // 1 minute
  };
}
