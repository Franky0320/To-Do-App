import { execSync } from 'node:child_process';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required for migrations.');
  process.exit(1);
}

execSync(`psql "${databaseUrl}" -v ON_ERROR_STOP=1 -f docs/postgres_schema.sql`, { stdio: 'inherit' });
console.log('Migration complete.');
