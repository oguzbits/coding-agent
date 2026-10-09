// Creates the database of the end-to-end tests when it is missing and migrates it. DATABASE_URL points at that database.
import { execFileSync } from 'node:child_process';
import pg from 'pg';

const target = new URL(process.env.DATABASE_URL ?? '');
const name = target.pathname.slice(1);
if (!name.endsWith('_e2e')) throw new Error('Refusing to touch a database that is not an _e2e database');

const admin = new URL(target);
admin.pathname = '/postgres';
const client = new pg.Client({ connectionString: admin.href });
await client.connect();
try {
  const found = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
  if (found.rowCount === 0) await client.query(`CREATE DATABASE "${name}"`);
} finally {
  await client.end();
}
execFileSync('npm', ['run', 'migration:run', '-w', '@coding-agent/api'], { stdio: 'inherit' });
