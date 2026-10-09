import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export interface SealedSecret {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
  keyVersion: number;
}

/**
 * AES-256-GCM for user secrets (the Gemini key). A fresh IV per encryption, the user id as additional authenticated
 * data so a row copied to another user cannot be decrypted, and the key version stored so the master key can rotate.
 */
/** Pinned so a shortened tag is rejected instead of accepted with weaker authentication. */
const TAG_LENGTH = 16;

export class KeyEncryption {
  constructor(
    private readonly masterKey: Buffer,
    private readonly keyVersion: number,
  ) {
    if (masterKey.length !== 32) throw new Error('The master key must be 32 bytes (AES-256)');
  }

  encrypt(plaintext: string, userId: string): SealedSecret {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.masterKey, iv, { authTagLength: TAG_LENGTH });
    cipher.setAAD(Buffer.from(userId));
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return { ciphertext, iv, tag: cipher.getAuthTag(), keyVersion: this.keyVersion };
  }

  decrypt(sealed: SealedSecret, userId: string): string {
    if (sealed.keyVersion !== this.keyVersion) {
      throw new Error(`No master key for key version ${sealed.keyVersion}`);
    }
    const decipher = createDecipheriv('aes-256-gcm', this.masterKey, sealed.iv, { authTagLength: TAG_LENGTH });
    decipher.setAAD(Buffer.from(userId));
    decipher.setAuthTag(sealed.tag);
    return Buffer.concat([decipher.update(sealed.ciphertext), decipher.final()]).toString('utf8');
  }
}
