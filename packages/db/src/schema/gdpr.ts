import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { apps } from './apps.js';

// ===========================================
// GDPR Request Type Enum
// ===========================================

export const gdprRequestTypeEnum = pgEnum('gdpr_request_type', [
  'export', // Data portability (Article 20)
  'delete', // Right to erasure (Article 17)
  'rectify', // Right to rectification (Article 16)
  'access', // Right of access (Article 15)
]);

// ===========================================
// GDPR Request Status Enum
// ===========================================

export const gdprRequestStatusEnum = pgEnum('gdpr_request_status', [
  'pending', // Request received, not yet processed
  'processing', // Currently being processed
  'completed', // Successfully completed
  'failed', // Failed to complete
  'cancelled', // Cancelled by requester or admin
]);

// ===========================================
// GDPR Requests Table
// Tracks all GDPR data subject requests
// ===========================================

export const gdprRequests = pgTable(
  'gdpr_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // The app context (null for platform-wide requests)
    // onDelete: 'set null' - Preserve GDPR request history even if app is deleted.
    // Required for compliance audit trails.
    appId: uuid('app_id').references(() => apps.id, { onDelete: 'set null' }),

    // The email address for the data subject
    emailAddress: text('email_address').notNull(),

    // Type of request
    requestType: gdprRequestTypeEnum('request_type').notNull(),

    // Current status
    status: gdprRequestStatusEnum('status').notNull().default('pending'),

    // Who requested this (user ID if admin, or 'data_subject' if via API)
    requestedBy: text('requested_by').notNull(),

    // Request metadata
    metadata: jsonb('metadata').$type<{
      reason?: string;
      verificationMethod?: string;
      verificationReference?: string;
      notes?: string;
    }>(),

    // Result data (for export requests, may contain file path or URL)
    result: jsonb('result').$type<{
      filePath?: string;
      fileUrl?: string;
      expiresAt?: string;
      recordsAffected?: number;
      error?: string;
      errorDetails?: string;
    }>(),

    // Processing timestamps
    processedAt: timestamp('processed_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),

    // Standard timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('gdpr_requests_app_id_idx').on(table.appId),
    index('gdpr_requests_email_idx').on(table.emailAddress),
    index('gdpr_requests_status_idx').on(table.status),
    index('gdpr_requests_type_idx').on(table.requestType),
    index('gdpr_requests_created_at_idx').on(table.createdAt),
  ]
);

export type GdprRequestRow = typeof gdprRequests.$inferSelect;
export type NewGdprRequestRow = typeof gdprRequests.$inferInsert;

// ===========================================
// Data Processing Records Table
// For Article 30 compliance - Record of Processing Activities
// ===========================================

export const dataProcessingRecords = pgTable(
  'data_processing_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // The app context
    appId: uuid('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),

    // Processing activity name
    name: text('name').notNull(),

    // Description of processing
    description: text('description'),

    // Purpose of processing
    purpose: text('purpose').notNull(),

    // Legal basis (consent, contract, legal obligation, vital interests, public task, legitimate interests)
    legalBasis: text('legal_basis').notNull(),

    // Categories of data subjects
    dataSubjectCategories: jsonb('data_subject_categories').$type<string[]>(),

    // Categories of personal data
    personalDataCategories: jsonb('personal_data_categories').$type<string[]>(),

    // Recipients or categories of recipients
    recipients: jsonb('recipients').$type<string[]>(),

    // Transfers to third countries (if any)
    thirdCountryTransfers:
      jsonb('third_country_transfers').$type<
        Array<{
          country: string;
          safeguards: string;
        }>
      >(),

    // Retention period description
    retentionPeriod: text('retention_period'),

    // Technical and organizational security measures
    securityMeasures: text('security_measures'),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('data_processing_records_app_id_idx').on(table.appId)]
);

export type DataProcessingRecordRow = typeof dataProcessingRecords.$inferSelect;
export type NewDataProcessingRecordRow = typeof dataProcessingRecords.$inferInsert;
