import os from 'node:os';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? 'postgres://coding_agent:coding_agent@localhost:5432/coding_agent_test';

export default defineConfig({
  test: {
    globals: true,
    projects: [
      {
        test: {
          name: 'unit',
          globals: true,
          include: ['src/**/*.test.ts'],
          exclude: ['**/*.db.test.ts', '**/node_modules/**'],
        },
      },
      {
        test: {
          name: 'db',
          globals: true,
          include: ['src/**/*.db.test.ts'],
          env: {
            TEST_DATABASE_URL: testDatabaseUrl,
            DATABASE_URL: testDatabaseUrl,
            LOG_LEVEL: 'error',
            SESSION_SECRET: 'test-session-secret-test-session-secret',
            MASTER_KEY: Buffer.alloc(32, 7).toString('base64'),
            REGISTRATION_OPEN: 'true',
            REQUIRE_EMAIL_CONFIRMATION: 'false',
            THROTTLE_AUTH_PER_MINUTE: '1000',
            WORKSPACES_DIR: path.join(os.tmpdir(), 'coding-agent-test-workspace'),
            PROJECT_FILE_VIEW_MAX_BYTES: '1000',
          },
          fileParallelism: false,
        },
      },
    ],
  },
});
