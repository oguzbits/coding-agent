import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { KeyEncryption } from './key-encryption.js';
import { PasswordHasher } from './password-hasher.js';
import { UserSettings } from './user-settings.entity.js';
import { User } from './user.entity.js';

export class EmailTakenError extends Error {}
export class RegistrationClosedError extends Error {}

export const REGISTRATION_OPEN = Symbol('REGISTRATION_OPEN');

export interface ModelSettings {
  modelName: string | null;
  requestsPerMinute: number | null;
  tokensPerMinute: number | null;
  requestsPerDay: number | null;
}

export interface SettingsView {
  hasGeminiKey: boolean;
  geminiKeyLast4: string | null;
  modelName: string | null;
  limits: Omit<ModelSettings, 'modelName'>;
}

const NO_SETTINGS = {
  geminiKeyCiphertext: null,
  geminiKeyLast4: null,
  modelName: null,
  requestsPerMinute: null,
  tokensPerMinute: null,
  requestsPerDay: null,
};

const normalizeEmail = (email: string) => email.trim().toLowerCase();

/** Key of the advisory lock that serializes registrations while they are closed. */
const FIRST_ACCOUNT_LOCK = 7_001;

@Injectable()
export class UsersService {
  private dummyHash?: Promise<string>;

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(UserSettings) private readonly settings: Repository<UserSettings>,
    private readonly hasher: PasswordHasher,
    private readonly encryption: KeyEncryption,
    @Inject(REGISTRATION_OPEN) private readonly registrationOpen: boolean,
  ) {}

  /** The first account can always be created; every further one needs registration to be open. */
  async register(email: string, password: string): Promise<User> {
    const normalized = normalizeEmail(email);
    // Hash before looking, so the time of the answer does not reveal whether the address is taken.
    const passwordHash = await this.hasher.hash(password);
    try {
      return await this.users.manager.transaction(async (manager) => {
        if (!this.registrationOpen) {
          // Without the lock, several first registrations at once would all see an empty table.
          await manager.query('SELECT pg_advisory_xact_lock($1)', [FIRST_ACCOUNT_LOCK]);
          if ((await manager.count(User)) > 0) throw new RegistrationClosedError();
        }
        if (await manager.existsBy(User, { email: normalized })) throw new EmailTakenError();
        return manager.save(manager.create(User, { email: normalized, passwordHash }));
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new EmailTakenError();
      throw error;
    }
  }

  async authenticate(email: string, password: string): Promise<User | null> {
    const user = await this.users.findOneBy({ email: normalizeEmail(email) });
    if (!user) {
      // Spend the same time as for a real user so the response time does not reveal which emails exist.
      this.dummyHash ??= this.hasher.hash('timing-equalizer');
      await this.hasher.verify(await this.dummyHash, password);
      return null;
    }
    return (await this.hasher.verify(user.passwordHash, password)) ? user : null;
  }

  findByEmail(email: string): Promise<User | null> {
    return this.users.findOneBy({ email: normalizeEmail(email) });
  }

  findById(id: string): Promise<User | null> {
    return this.users.findOneBy({ id });
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<boolean> {
    const user = await this.users.findOneBy({ id: userId });
    if (!user || !(await this.hasher.verify(user.passwordHash, currentPassword))) return false;
    await this.users.update({ id: userId }, { passwordHash: await this.hasher.hash(newPassword) });
    return true;
  }

  async verifyPassword(userId: string, password: string): Promise<boolean> {
    const user = await this.users.findOneBy({ id: userId });
    return user !== null && (await this.hasher.verify(user.passwordHash, password));
  }

  /** Settings, projects, conversations and usage go with the user through the foreign keys. */
  async delete(userId: string): Promise<void> {
    await this.users.delete({ id: userId });
  }

  async markEmailConfirmed(userId: string): Promise<void> {
    await this.users.update({ id: userId, emailVerifiedAt: IsNull() }, { emailVerifiedAt: new Date() });
  }

  async setPassword(userId: string, newPassword: string): Promise<void> {
    await this.users.update({ id: userId }, { passwordHash: await this.hasher.hash(newPassword) });
  }

  async getSettings(userId: string): Promise<SettingsView> {
    const row = (await this.settings.findOneBy({ userId })) ?? NO_SETTINGS;
    return {
      hasGeminiKey: row.geminiKeyCiphertext != null,
      geminiKeyLast4: row.geminiKeyLast4,
      modelName: row.modelName,
      limits: {
        requestsPerMinute: row.requestsPerMinute,
        tokensPerMinute: row.tokensPerMinute,
        requestsPerDay: row.requestsPerDay,
      },
    };
  }

  async setGeminiKey(userId: string, apiKey: string): Promise<void> {
    const sealed = this.encryption.encrypt(apiKey, userId);
    await this.settings.upsert(
      {
        userId,
        geminiKeyCiphertext: sealed.ciphertext,
        geminiKeyIv: sealed.iv,
        geminiKeyTag: sealed.tag,
        geminiKeyVersion: sealed.keyVersion,
        geminiKeyLast4: apiKey.slice(-4),
      },
      ['userId'],
    );
  }

  async clearGeminiKey(userId: string): Promise<void> {
    await this.settings.update(
      { userId },
      {
        geminiKeyCiphertext: null,
        geminiKeyIv: null,
        geminiKeyTag: null,
        geminiKeyVersion: null,
        geminiKeyLast4: null,
      },
    );
  }

  /** Decrypts the key for a run. The caller passes it on and must never log it. */
  async getGeminiKey(userId: string): Promise<string | null> {
    const row = await this.settings.findOneBy({ userId });
    if (!row?.geminiKeyCiphertext || !row.geminiKeyIv || !row.geminiKeyTag || row.geminiKeyVersion == null) return null;
    return this.encryption.decrypt(
      {
        ciphertext: row.geminiKeyCiphertext,
        iv: row.geminiKeyIv,
        tag: row.geminiKeyTag,
        keyVersion: row.geminiKeyVersion,
      },
      userId,
    );
  }

  /** Fields left out stay as they are; null resets a field to the default from the config. */
  async setModelSettings(userId: string, changes: Partial<ModelSettings>): Promise<void> {
    const defined = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined));
    await this.settings.upsert({ userId, ...defined }, ['userId']);
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}
