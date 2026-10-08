import { validateEnv } from './env.validation.js';

const valid = { DATABASE_URL: 'postgres://u:p@localhost:5432/db' };

describe('validateEnv', () => {
  it('applies defaults for optional values', () => {
    const env = validateEnv(valid);
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.HOST).toBe('127.0.0.1');
    expect(env.LOG_LEVEL).toBe('log');
    expect(env.ALLOWED_ORIGINS).toEqual(['http://localhost:5173']);
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
});
