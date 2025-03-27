import { config } from 'dotenv';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

// Load environment variables from your dev.vars file
config({ path: './.dev.vars' });

console.log('Loaded DATABASE_URL →', process.env.DATABASE_URL);

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

// Create a Postgres client and Drizzle instance
const sql = postgres(DATABASE_URL, { ssl: 'require', max: 1 });
const db = drizzle(sql);

async function main() {
  try {
    await migrate(db, { migrationsFolder: './drizzle' });
    console.log('✅ Migration complete');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
  process.exit(0);
}

main();