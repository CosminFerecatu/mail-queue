import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'node:path';
import { z } from 'zod';

// Load .env from root directory
dotenvConfig({ path: resolve(import.meta.dirname, '../../../.env') });

/**
 * Zod schema for parsing boolean values from environment variables
 * Accepts: 'true', '1', 'yes' as truthy values (case-insensitive)
 */
const envBoolean = (defaultValue: boolean) =>
  z.preprocess((val) => {
    if (val === undefined || val === null || val === '') return defaultValue;
    if (typeof val === 'boolean') return val;
    const str = String(val).toLowerCase().trim();
    return str === 'true' || str === '1' || str === 'yes';
  }, z.boolean());

const ConfigSchema = z.object({
  // Worker
  concurrency: z.coerce.number().int().min(1).max(100).default(10),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),

  // Database
  databaseUrl: z.string().url(),

  // Redis
  redisUrl: z.string().url(),

  // Security
  encryptionKey: z.string().length(64),

  // SMTP (default/fallback)
  smtpHost: z.string().optional(),
  smtpPort: z.coerce.number().int().min(1).max(65535).default(587),
  smtpSecure: envBoolean(false),
  smtpUser: z.string().optional(),
  smtpPass: z.string().optional(),

  // Logging
  logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Metrics
  metricsPort: z.coerce.number().int().min(1).max(65535).default(9090),
  metricsAuthUser: z.string().optional(),
  metricsAuthPass: z.string().optional(),

  // Privacy
  anonymizeIpAddresses: envBoolean(true),
});

export type Config = z.infer<typeof ConfigSchema>;

function loadConfig(): Config {
  const result = ConfigSchema.safeParse({
    concurrency: process.env['WORKER_CONCURRENCY'],
    nodeEnv: process.env['NODE_ENV'],
    databaseUrl: process.env['DATABASE_URL'],
    redisUrl: process.env['REDIS_URL'],
    encryptionKey: process.env['ENCRYPTION_KEY'],
    smtpHost: process.env['SMTP_HOST'],
    smtpPort: process.env['SMTP_PORT'],
    smtpSecure: process.env['SMTP_SECURE'],
    smtpUser: process.env['SMTP_USER'],
    smtpPass: process.env['SMTP_PASS'],
    logLevel: process.env['LOG_LEVEL'],
    metricsPort: process.env['METRICS_PORT'],
    metricsAuthUser: process.env['METRICS_AUTH_USER'],
    metricsAuthPass: process.env['METRICS_AUTH_PASS'],
    anonymizeIpAddresses: process.env['ANONYMIZE_IP_ADDRESSES'],
  });

  if (!result.success) {
    const errors = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid configuration:\n${errors.join('\n')}`);
  }

  return result.data;
}

export const config = loadConfig();

export function isDevelopment(): boolean {
  return config.nodeEnv === 'development';
}

export function isProduction(): boolean {
  return config.nodeEnv === 'production';
}
