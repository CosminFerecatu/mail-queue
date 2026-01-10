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

const ADMIN_EMAIL = process.env['ADMIN_EMAIL'] || 'admin@mailqueue.local';
const ADMIN_PASSWORD = process.env['ADMIN_PASSWORD'] || 'admin123456';
const ADMIN_NAME = process.env['ADMIN_NAME'] || 'Admin User';

async function seed() {
  console.log('Connecting to database...');
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
      console.log(`Admin user already exists: ${ADMIN_EMAIL}`);
      console.log('Skipping seed.');
      return;
    }

    // Hash password
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);

    // Create admin user
    const [newUser] = await db
      .insert(users)
      .values({
        email: ADMIN_EMAIL,
        passwordHash,
        name: ADMIN_NAME,
        role: 'super_admin',
        isActive: true,
      })
      .returning();

    console.log('\n===========================================');
    console.log('Admin user created successfully!');
    console.log('===========================================');
    console.log(`Email:    ${ADMIN_EMAIL}`);
    console.log(`Password: ${ADMIN_PASSWORD}`);
    console.log(`Role:     super_admin`);
    console.log(`ID:       ${newUser?.id}`);
    console.log('===========================================\n');
    console.log('You can now login to the dashboard with these credentials.');
    console.log('Make sure to change the password after first login!\n');
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
