import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { IsNull, LessThan, Not, Repository } from 'typeorm';
import { AccountToken, type TokenPurpose } from './account-token.entity.js';

const hashOf = (token: string) => createHash('sha256').update(token).digest('hex');

@Injectable()
export class AccountTokensService {
  constructor(@InjectRepository(AccountToken) private readonly tokens: Repository<AccountToken>) {}

  /** Creates a token and returns it. Older unused tokens of the same purpose stop working. */
  async issue(userId: string, purpose: TokenPurpose, validMinutes: number): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    // One transaction: a failure between the two statements must not leave the user without any working token.
    await this.tokens.manager.transaction(async (manager) => {
      await manager.delete(AccountToken, { userId, purpose, usedAt: IsNull() });
      await manager.insert(AccountToken, {
        userId,
        purpose,
        tokenHash: hashOf(token),
        expiresAt: new Date(Date.now() + validMinutes * 60_000),
      });
    });
    return token;
  }

  /** Makes all unused tokens of this purpose stop working. */
  async revoke(userId: string, purpose: TokenPurpose): Promise<void> {
    await this.tokens.delete({ userId, purpose, usedAt: IsNull() });
  }

  /** Deletes tokens that can no longer be used. Returns how many were removed. */
  async deleteExpiredAndUsed(): Promise<number> {
    const expired = await this.tokens.delete({ expiresAt: LessThan(new Date()) });
    const used = await this.tokens.delete({ usedAt: Not(IsNull()) });
    return (expired.affected ?? 0) + (used.affected ?? 0);
  }

  /** Uses the token up and returns the user it belongs to, or null if it is unknown, used, expired or for another purpose. */
  async consume(token: string, purpose: TokenPurpose): Promise<string | null> {
    const result = await this.tokens
      .createQueryBuilder()
      .update()
      .set({ usedAt: () => 'now()' })
      .where('token_hash = :hash AND purpose = :purpose AND used_at IS NULL AND expires_at > now()', {
        hash: hashOf(token),
        purpose,
      })
      .returning('user_id')
      .execute();
    const row = (result.raw as { user_id: string }[])[0];
    return row?.user_id ?? null;
  }
}
