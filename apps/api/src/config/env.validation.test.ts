import { testEnv } from '../testing/test-env.js';
import { validateEnv } from './env.validation.js';

const valid = testEnv();

describe('validateEnv', () => {
  it('applies defaults for optional values', () => {
    const env = validateEnv(valid);
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.HOST).toBe('127.0.0.1');
    expect(env.LOG_LEVEL).toBe('log');
    expect(env.ALLOWED_ORIGINS).toEqual(['http://localhost:5173']);
    expect(env.TRUST_PROXY).toBe(0);
  });

  it('reads TRUST_PROXY as the number of proxies in front and rejects other values', () => {
    expect(validateEnv({ ...valid, TRUST_PROXY: '2' }).TRUST_PROXY).toBe(2);
    expect(() => validateEnv({ ...valid, TRUST_PROXY: '-1' })).toThrow(/TRUST_PROXY/);
    expect(() => validateEnv({ ...valid, TRUST_PROXY: 'true' })).toThrow(/TRUST_PROXY/);
  });

  it('converts PORT to a number and splits ALLOWED_ORIGINS', () => {
    const env = validateEnv({
      ...valid,
      PORT: '8080',
      ALLOWED_ORIGINS: 'https://a.example, https://b.example',
    });
    expect(env.PORT).toBe(8080);
    expect(env.ALLOWED_ORIGINS).toEqual(['https://a.example', 'https://b.example']);
  });

  it('rejects a missing DATABASE_URL and names it', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
  });

  it('rejects a port outside the valid range', () => {
    expect(() => validateEnv({ ...valid, PORT: '70000' })).toThrow(/PORT/);
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => validateEnv({ ...valid, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  it('does not echo secret values in the error message', () => {
    const attempt = () => validateEnv({ DATABASE_URL: 'not-a-url-with-secret-pw' });
    expect(attempt).toThrow(/DATABASE_URL/);
    expect(attempt).not.toThrow(/secret-pw/);
  });

  it('defaults the account settings: registration closed, key version 1, bounded session lifetime', () => {
    const env = validateEnv(valid);
    expect(env.REGISTRATION_OPEN).toBe(false);
    expect(env.MASTER_KEY_VERSION).toBe(1);
    expect(env.SESSION_IDLE_MINUTES).toBe(480);
    expect(env.SESSION_MAX_HOURS).toBe(168);
  });

  it('reads REGISTRATION_OPEN=true as a boolean and treats anything else as an error', () => {
    expect(validateEnv({ ...valid, REGISTRATION_OPEN: 'true' }).REGISTRATION_OPEN).toBe(true);
    expect(validateEnv({ ...valid, REGISTRATION_OPEN: 'false' }).REGISTRATION_OPEN).toBe(false);
    expect(() => validateEnv({ ...valid, REGISTRATION_OPEN: 'yes' })).toThrow(/REGISTRATION_OPEN/);
  });

  it('requires a session secret of at least 32 characters', () => {
    expect(() => validateEnv({ ...valid, SESSION_SECRET: 'short' })).toThrow(/SESSION_SECRET/);
    expect(() => validateEnv({ DATABASE_URL: valid.DATABASE_URL, MASTER_KEY: valid.MASTER_KEY })).toThrow(
      /SESSION_SECRET/,
    );
  });

  it('requires the master key as base64 of exactly 32 bytes', () => {
    expect(() => validateEnv({ ...valid, MASTER_KEY: Buffer.alloc(16).toString('base64') })).toThrow(/MASTER_KEY/);
    expect(() => validateEnv({ ...valid, MASTER_KEY: 'not base64!!' })).toThrow(/MASTER_KEY/);
  });

  it('defaults the throttling limits and accepts overrides', () => {
    const env = validateEnv(valid);
    expect(env.THROTTLE_DEFAULT_PER_MINUTE).toBe(300);
    expect(env.THROTTLE_AUTH_PER_MINUTE).toBe(10);
    expect(validateEnv({ ...valid, THROTTLE_AUTH_PER_MINUTE: '1000' }).THROTTLE_AUTH_PER_MINUTE).toBe(1000);
    expect(() => validateEnv({ ...valid, THROTTLE_AUTH_PER_MINUTE: '0' })).toThrow(/THROTTLE_AUTH_PER_MINUTE/);
  });
  it('defaults the agent settings to the fake provider and bounded runs', () => {
    const env = validateEnv(valid);
    expect(env.MODEL_PROVIDER).toBe('fake');
    expect(env.AGENT_MAX_STEPS).toBe(25);
    expect(env.AGENT_REPEAT_FAILURE_LIMIT).toBe(3);
    expect(env.AGENT_HISTORY_TOKEN_BUDGET).toBeGreaterThan(0);
    expect(env.AGENT_TOOL_OUTPUT_MAX_CHARS).toBeGreaterThan(0);
    expect(env.AGENT_READ_MAX_BYTES).toBeGreaterThan(0);
    expect(env.SSE_HEARTBEAT_SECONDS).toBe(15);
    expect(env.WORKSPACES_DIR).toBeTruthy();
  });

  it('rejects an unknown provider and non-positive limits', () => {
    expect(() => validateEnv({ ...valid, MODEL_PROVIDER: 'other' })).toThrow(/MODEL_PROVIDER/);
    expect(() => validateEnv({ ...valid, AGENT_MAX_STEPS: '0' })).toThrow(/AGENT_MAX_STEPS/);
  });
  it('defaults the Gemini model and the free-tier limits, and accepts the gemini provider', () => {
    const env = validateEnv(valid);
    expect(env.GEMINI_DEFAULT_MODEL).toMatch(/^gemini-/);
    expect(env.GEMINI_DEFAULT_REQUESTS_PER_MINUTE).toBe(15);
    expect(env.GEMINI_DEFAULT_TOKENS_PER_MINUTE).toBe(250_000);
    expect(env.GEMINI_DEFAULT_REQUESTS_PER_DAY).toBe(500);
    expect(validateEnv({ ...valid, MODEL_PROVIDER: 'gemini' }).MODEL_PROVIDER).toBe('gemini');
  });
});
