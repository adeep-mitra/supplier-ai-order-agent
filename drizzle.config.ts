import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    // this must be named `url`, not `connectionString`
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;
