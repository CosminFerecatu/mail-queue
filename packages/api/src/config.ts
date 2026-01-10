import { z } from 'zod';

const ConfigSchema = z.object({
  // Server
  port: z.coerce.number().int().min(1).max(65535).default(3000),
  host: z.string().default('0.0.0.0'),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),

  // Database
  databaseUrl: z.string().url(),

  // Redis
  redisUrl: z.string().url(),

  // Security
  adminSecret: z.string().min(16),
  encryptionKey: z.string().length(64),
  jwtSecret: z.string().min(32),

  // Rate Limiting
  globalRateLimit: z.coerce.number().int().positive().default(10000),

  // Logging
  logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type Config = z.infer<typeof ConfigSchema>;

function loadConfig(): Config {
  const result = ConfigSchema.safeParse({
    port: process.env['API_PORT'] ?? process.env['PORT'],
    host: process.env['API_HOST'] ?? process.env['HOST'],
    nodeEnv: process.env['NODE_ENV'],
    databaseUrl: process.env['DATABASE_URL'],
    redisUrl: process.env['REDIS_URL'],
    adminSecret: process.env['ADMIN_SECRET'],
    encryptionKey: process.env['ENCRYPTION_KEY'],
    jwtSecret: process.env['JWT_SECRET'],
    globalRateLimit: process.env['GLOBAL_RATE_LIMIT'],
    logLevel: process.env['LOG_LEVEL'],
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

export function isTest(): boolean {
  return config.nodeEnv === 'test';
}
