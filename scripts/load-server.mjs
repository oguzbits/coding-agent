// Starts the built API for load tests: own database (coding_agent_load), fake model with a delay per call, throttler
// limits raised, metrics on. Build first (npm run build). Numbers from one machine compare two states of the code;
// they say nothing about capacity in production.
import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';
import pg from 'pg';

const root = path.resolve(import.meta.dirname, '..');
const databaseUrl =
  process.env.LOAD_DATABASE_URL ?? 'postgres://coding_agent:coding_agent@localhost:5432/coding_agent_load';
const name = new URL(databaseUrl).pathname.slice(1);
if (!name.endsWith('_load')) throw new Error('Refusing to use a database that is not a _load database');

const admin = new URL(databaseUrl);
admin.pathname = '/postgres';
const client = new pg.Client({ connectionString: admin.href });
await client.connect();
try {
  if ((await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name])).rowCount === 0) {
    await client.query(`CREATE DATABASE "${name}"`);
  }
} finally {
  await client.end();
}

const env = {
  ...process.env,
  NODE_ENV: 'production',
  DATABASE_URL: databaseUrl,
  HOST: '0.0.0.0',
  SESSION_SECRET: 'load-session-secret-load-session-secret',
  MASTER_KEY: Buffer.alloc(32, 5).toString('base64'),
  COOKIE_SECURE: 'false',
  REGISTRATION_OPEN: 'true',
  REQUIRE_EMAIL_CONFIRMATION: 'false',
  MODEL_PROVIDER: 'fake',
  FAKE_MODEL_DELAY_MS: process.env.FAKE_MODEL_DELAY_MS ?? '500',
  THROTTLE_DEFAULT_PER_MINUTE: '1000000',
  THROTTLE_AUTH_PER_MINUTE: '1000000',
  WORKSPACES_DIR: process.env.LOAD_WORKSPACES_DIR ?? '/tmp/coding-agent-load-workspaces',
  METRICS_TOKEN: process.env.METRICS_TOKEN ?? 'load-metrics-token-load',
  LOG_LEVEL: 'warn',
};
execFileSync('npm', ['run', 'migration:run', '-w', '@coding-agent/api'], { stdio: 'inherit', env });
console.log(`Load server on :3000, metrics token ${env.METRICS_TOKEN}`);
const server = spawn('node', ['apps/api/dist/main.js'], { stdio: 'inherit', env, cwd: root });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal));
server.on('exit', (code) => process.exit(code ?? 0));
