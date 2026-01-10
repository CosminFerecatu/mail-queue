import { z } from 'zod';

// ===========================================
// Suppression Reason
// ===========================================

export const SuppressionReasonSchema = z.enum([
  'hard_bounce',
  'soft_bounce',
  'complaint',
  'unsubscribe',
  'manual',
]);

export type SuppressionReason = z.infer<typeof SuppressionReasonSchema>;

// ===========================================
// Suppression Entry Models
// ===========================================

export const SuppressionEntrySchema = z.object({
  id: z.string().uuid(),
  appId: z.string().uuid().nullable(), // null = global
  emailAddress: z.string().email(),
  reason: SuppressionReasonSchema,
  sourceEmailId: z.string().uuid().nullable(),
  expiresAt: z.date().nullable(),
  createdAt: z.date(),
});

export type SuppressionEntry = z.infer<typeof SuppressionEntrySchema>;

export const CreateSuppressionSchema = z.object({
  emailAddress: z.string().email(),
  reason: SuppressionReasonSchema.default('manual'),
  expiresAt: z.string().datetime().optional(),
});

export type CreateSuppressionInput = z.infer<typeof CreateSuppressionSchema>;

export const BulkSuppressionSchema = z.object({
  emailAddresses: z.array(z.string().email()).min(1).max(10_000),
  reason: SuppressionReasonSchema.default('manual'),
  expiresAt: z.string().datetime().optional(),
});

export type BulkSuppressionInput = z.infer<typeof BulkSuppressionSchema>;

// ===========================================
// Suppression Check Response
// ===========================================

export const SuppressionCheckResultSchema = z.object({
  emailAddress: z.string().email(),
  isSuppressed: z.boolean(),
  reason: SuppressionReasonSchema.nullable(),
  scope: z.enum(['global', 'app']).nullable(),
  expiresAt: z.date().nullable(),
});

export type SuppressionCheckResult = z.infer<typeof SuppressionCheckResultSchema>;
