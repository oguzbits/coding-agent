/** A complete, valid environment for tests. Values are fake; override single entries per test. */
export function testEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    DATABASE_URL: 'postgres://u:p@localhost:5432/db',
    SESSION_SECRET: 'test-session-secret-test-session-secret',
    MASTER_KEY: Buffer.alloc(32, 7).toString('base64'),
    ...overrides,
  };
}
