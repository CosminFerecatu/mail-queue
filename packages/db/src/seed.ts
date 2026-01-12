import { config } from 'dotenv';
import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import bcrypt from 'bcrypt';
import { users } from './schema/users.js';
import { eq } from 'drizzle-orm';

// Load .env from root directory
config({ path: resolve(import.meta.dirname, '../../../.env') });

const DATABASE_URL = process.env['DATABASE_URL'];
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

const ADMIN_EMAIL = process.env['ADMIN_EMAIL'];
const ADMIN_PASSWORD = process.env['ADMIN_PASSWORD'];
const ADMIN_NAME = process.env['ADMIN_NAME'] || 'Admin User';

if (!ADMIN_EMAIL) {
  throw new Error('ADMIN_EMAIL environment variable is required. Do not use default credentials in production.');
}

if (!ADMIN_PASSWORD) {
  throw new Error('ADMIN_PASSWORD environment variable is required. Do not use default credentials in production.');
}

async function seed() {
  const client = postgres(DATABASE_URL as string);
  const db = drizzle(client);

  try {
    // Check if admin user exists
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, ADMIN_EMAIL))
      .limit(1);

    if (existingUser) {
      return;
    }

    // Hash password
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);

    // Create admin user
    await db
      .insert(users)
      .values({
        email: ADMIN_EMAIL,
        passwordHash,
        name: ADMIN_NAME,
        role: 'super_admin',
        isActive: true,
      })
      .returning();
  } catch (error) {
    console.error('Seed failed:', error);
    throw error;
  } finally {
    await client.end();
  }
}

seed().catch((error) => {
  console.error('Seed error:', error);
  process.exit(1);
});
