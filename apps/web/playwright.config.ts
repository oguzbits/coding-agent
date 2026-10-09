import { defineConfig } from '@playwright/test';

// Runs against the real API with the fake model provider. Needs Postgres (npm run db:up).
// The API uses its own database, so the tests never touch development data.
const DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? 'postgres://coding_agent:coding_agent@localhost:5432/coding_agent_e2e';
const apiEnv = {
  DATABASE_URL,
  SESSION_SECRET: 'e2e-session-secret-e2e-session-secret',
  MASTER_KEY: Buffer.alloc(32, 9).toString('base64'),
  MODEL_PROVIDER: 'fake',
  REGISTRATION_OPEN: 'true',
  REQUIRE_EMAIL_CONFIRMATION: 'false',
  THROTTLE_AUTH_PER_MINUTE: '1000',
  WORKSPACES_DIR: process.env.E2E_WORKSPACES_DIR ?? '/tmp/coding-agent-e2e-workspaces',
  ALLOWED_ORIGINS: 'http://localhost:5173',
  LOG_LEVEL: 'error',
};

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:5173', channel: process.env.CI ? undefined : 'chrome', trace: 'retain-on-failure' },
  webServer: [
    {
      command: 'node ../../scripts/e2e-database.mjs && npm run start -w @coding-agent/api',
      port: 3000,
      env: apiEnv,
      reuseExistingServer: false,
      timeout: 240_000,
    },
    {
      command: 'npm run dev -- --port 5173 --strictPort',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
    },
  ],
});
