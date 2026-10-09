import { randomBytes } from 'node:crypto';
import { KeyEncryption } from './key-encryption.js';

const masterKey = randomBytes(32);
const userId = '3f1d2c9e-0000-4000-8000-000000000001';
const otherUserId = '3f1d2c9e-0000-4000-8000-000000000002';

describe('KeyEncryption', () => {
  const encryption = new KeyEncryption(masterKey, 1);

  it('decrypts what it encrypted', () => {
    const sealed = encryption.encrypt('AIza-example-key', userId);
    expect(encryption.decrypt(sealed, userId)).toBe('AIza-example-key');
  });

  it('does not contain the plaintext and records the key version', () => {
    const sealed = encryption.encrypt('AIza-example-key', userId);
    expect(sealed.ciphertext.toString('utf8')).not.toContain('AIza');
    expect(sealed.keyVersion).toBe(1);
    expect(sealed.iv).toHaveLength(12);
    expect(sealed.tag).toHaveLength(16);
  });

  it('uses a fresh IV for every encryption', () => {
    const first = encryption.encrypt('same', userId);
    const second = encryption.encrypt('same', userId);
    expect(first.iv.equals(second.iv)).toBe(false);
    expect(first.ciphertext.equals(second.ciphertext)).toBe(false);
  });

  it('refuses to decrypt for another user (user id is bound as additional data)', () => {
    const sealed = encryption.encrypt('secret', userId);
    expect(() => encryption.decrypt(sealed, otherUserId)).toThrow();
  });

  it('refuses tampered ciphertext or tag', () => {
    const sealed = encryption.encrypt('secret', userId);
    const flipped = Buffer.from(sealed.ciphertext);
    flipped[0] ^= 1;
    expect(() => encryption.decrypt({ ...sealed, ciphertext: flipped }, userId)).toThrow();
    const badTag = Buffer.from(sealed.tag);
    badTag[0] ^= 1;
    expect(() => encryption.decrypt({ ...sealed, tag: badTag }, userId)).toThrow();
  });

  it('refuses a key version it does not have', () => {
    const sealed = encryption.encrypt('secret', userId);
    expect(() => encryption.decrypt({ ...sealed, keyVersion: 2 }, userId)).toThrow(/key version/i);
  });

  it('rejects a master key that is not 32 bytes', () => {
    expect(() => new KeyEncryption(randomBytes(16), 1)).toThrow(/32 bytes/);
  });

  it('refuses a shortened authentication tag', () => {
    const sealed = encryption.encrypt('secret', userId);
    expect(() => encryption.decrypt({ ...sealed, tag: sealed.tag.subarray(0, 4) }, userId)).toThrow();
  });
});
