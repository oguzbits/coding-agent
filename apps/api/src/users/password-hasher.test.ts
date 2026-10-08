import { PasswordHasher } from './password-hasher.js';

describe('PasswordHasher', () => {
  const hasher = new PasswordHasher();

  it('produces an Argon2id hash with at least the OWASP parameters', async () => {
    const hash = await hasher.hash('correct horse battery staple');
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$/);
    const [, m, t, p] = hash.match(/m=(\d+),t=(\d+),p=(\d+)/) ?? [];
    expect(Number(m)).toBeGreaterThanOrEqual(19456);
    expect(Number(t)).toBeGreaterThanOrEqual(2);
    expect(Number(p)).toBeGreaterThanOrEqual(1);
  });

  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await hasher.hash('correct horse battery staple');
    expect(await hasher.verify(hash, 'correct horse battery staple')).toBe(true);
    expect(await hasher.verify(hash, 'wrong horse battery staple')).toBe(false);
  });

  it('salts every hash', async () => {
    expect(await hasher.hash('same password 123')).not.toBe(await hasher.hash('same password 123'));
  });

  it('returns false instead of throwing for a malformed stored hash', async () => {
    expect(await hasher.verify('not-a-hash', 'whatever')).toBe(false);
  });
});
