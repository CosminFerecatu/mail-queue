import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

export * from './schema/index.js';

// ===========================================
// Database Types
// ===========================================

export type Database = PostgresJsDatabase<typeof schema>;

// ===========================================
// Database Connection
// ===========================================

/**
 * Default connection pool configuration.
 * - max: Maximum number of connections in the pool
 * - idleTimeout: Seconds before an idle connection is closed
 * - connectTimeout: Seconds to wait for a connection before timing out
 */
const DEFAULT_POOL_CONFIG = {
  max: 10,
  idleTimeout: 20,
  connectTimeout: 10,
} as const;

let db: Database | null = null;
let client: postgres.Sql | null = null;

export interface DatabaseConfig {
  url: string;
  maxConnections?: number;
  idleTimeout?: number;
  connectTimeout?: number;
}

/**
 * Create a new database connection instance.
 *
 * Use this function when you need isolated database instances, such as in tests
 * where each test suite may require its own connection to ensure isolation.
 *
 * @param config - Database configuration including URL and optional pool settings
 * @returns A new Database instance (not cached/singleton)
 */
export function createDatabase(config: DatabaseConfig): Database {
  const sql = postgres(config.url, {
    max: config.maxConnections ?? DEFAULT_POOL_CONFIG.max,
    idle_timeout: config.idleTimeout ?? DEFAULT_POOL_CONFIG.idleTimeout,
    connect_timeout: config.connectTimeout ?? DEFAULT_POOL_CONFIG.connectTimeout,
  });

  return drizzle(sql, { schema });
}

/**
 * Get the singleton database connection for production use.
 *
 * This function implements the singleton pattern - it creates a connection on first
 * call and returns the same instance on subsequent calls. Use this in production
 * code to ensure efficient connection reuse across the application.
 *
 * For tests requiring isolated connections, use `createDatabase()` instead.
 *
 * @returns The singleton Database instance
 * @throws Error if DATABASE_URL environment variable is not set
 */
export function getDatabase(): Database {
  if (!db) {
    const url = process.env['DATABASE_URL'];
    if (!url) {
      throw new Error('DATABASE_URL environment variable is required');
    }

    client = postgres(url, {
      max: DEFAULT_POOL_CONFIG.max,
      idle_timeout: DEFAULT_POOL_CONFIG.idleTimeout,
      connect_timeout: DEFAULT_POOL_CONFIG.connectTimeout,
    });

    db = drizzle(client, { schema });
  }

  return db;
}

/**
 * Close the database connection
 */
export async function closeDatabase(): Promise<void> {
  if (client) {
    await client.end();
    client = null;
    db = null;
  }
}

/**
 * Check database connectivity
 */
export async function checkDatabaseConnection(database: Database): Promise<boolean> {
  try {
    await database.execute('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
