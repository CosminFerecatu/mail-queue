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

let db: Database | null = null;
let client: postgres.Sql | null = null;

export interface DatabaseConfig {
  url: string;
  maxConnections?: number;
  idleTimeout?: number;
  connectTimeout?: number;
}

/**
 * Create a database connection
 */
export function createDatabase(config: DatabaseConfig): Database {
  const sql = postgres(config.url, {
    max: config.maxConnections ?? 10,
    idle_timeout: config.idleTimeout ?? 20,
    connect_timeout: config.connectTimeout ?? 10,
  });

  return drizzle(sql, { schema });
}

/**
 * Get or create the default database connection
 * Uses DATABASE_URL environment variable
 */
export function getDatabase(): Database {
  if (!db) {
    const url = process.env['DATABASE_URL'];
    if (!url) {
      throw new Error('DATABASE_URL environment variable is required');
    }

    client = postgres(url, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
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
