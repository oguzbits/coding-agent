import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { IsNull, Repository } from 'typeorm';
import { AccountToken, type TokenPurpose } from './account-token.entity.js';

const hashOf = (token: string) => createHash('sha256').update(token).digest('hex');

@Injectable()
export class AccountTokensService {
  constructor(@InjectRepository(AccountToken) private readonly tokens: Repository<AccountToken>) {}

  /** Creates a token and returns it. Older unused tokens of the same purpose stop working. */
  async issue(userId: string, purpose: TokenPurpose, validMinutes: number): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.tokens.delete({ userId, purpose, usedAt: IsNull() });
    await this.tokens.insert({
      userId,
      purpose,
      tokenHash: hashOf(token),
      expiresAt: new Date(Date.now() + validMinutes * 60_000),
    });
    return token;
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
