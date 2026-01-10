import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './dist/schema/index.js',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? 'postgresql://mailqueue:mailqueue@localhost:5432/mailqueue',
  },
  verbose: true,
  strict: true,
});
