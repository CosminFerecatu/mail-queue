import { z } from 'zod';

// ===========================================
// Pagination
// ===========================================

export const PaginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    data: z.array(dataSchema),
    cursor: z.string().nullable(),
    hasMore: z.boolean(),
  });

export interface PaginatedResponse<T> {
  data: T[];
  cursor: string | null;
  hasMore: boolean;
}

// ===========================================
// API Response
// ===========================================

export const ApiSuccessResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
  });

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export const ApiErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
  }),
});

export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// ===========================================
// Health Check
// ===========================================

export const HealthCheckStatusSchema = z.enum(['healthy', 'degraded', 'unhealthy']);

export type HealthCheckStatus = z.infer<typeof HealthCheckStatusSchema>;

export const ComponentHealthSchema = z.object({
  status: HealthCheckStatusSchema,
  latencyMs: z.number().optional(),
  message: z.string().optional(),
});

export type ComponentHealth = z.infer<typeof ComponentHealthSchema>;

export const HealthCheckResponseSchema = z.object({
  status: HealthCheckStatusSchema,
  version: z.string(),
  uptimeSeconds: z.number(),
  checks: z.object({
    postgresql: ComponentHealthSchema,
    redis: ComponentHealthSchema,
    smtp: ComponentHealthSchema.optional(),
    workers: z
      .object({
        active: z.number().int(),
        idle: z.number().int(),
      })
      .optional(),
  }),
  queues: z
    .object({
      totalPending: z.number().int(),
      totalProcessing: z.number().int(),
    })
    .optional(),
});

export type HealthCheckResponse = z.infer<typeof HealthCheckResponseSchema>;

// ===========================================
// Audit Log
// ===========================================

export const ActorTypeSchema = z.enum(['user', 'app', 'system']);

export type ActorType = z.infer<typeof ActorTypeSchema>;

export const AuditLogSchema = z.object({
  id: z.string().uuid(),
  actorType: ActorTypeSchema,
  actorId: z.string().uuid(),
  action: z.string(),
  resourceType: z.string(),
  resourceId: z.string().uuid().nullable(),
  changes: z
    .object({
      before: z.record(z.unknown()).optional(),
      after: z.record(z.unknown()).optional(),
    })
    .nullable(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  createdAt: z.date(),
});

export type AuditLog = z.infer<typeof AuditLogSchema>;

// ===========================================
// User (Admin Dashboard)
// ===========================================

export const UserRoleSchema = z.enum(['super_admin', 'admin', 'viewer']);

export type UserRole = z.infer<typeof UserRoleSchema>;

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().max(100),
  role: UserRoleSchema,
  mfaEnabled: z.boolean().default(false),
  lastLoginAt: z.date().nullable(),
  isActive: z.boolean().default(true),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type User = z.infer<typeof UserSchema>;

export const UserResponseSchema = UserSchema.omit({});

export type UserResponse = z.infer<typeof UserResponseSchema>;
