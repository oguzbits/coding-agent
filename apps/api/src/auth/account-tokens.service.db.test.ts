import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AppConfigModule } from '../config/app-config.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { resetTestDatabase } from '../testing/test-database.js';
import { User } from '../users/user.entity.js';
import { AccountToken } from './account-token.entity.js';
import { AccountTokensService } from './account-tokens.service.js';

describe('AccountTokensService', () => {
  let moduleRef: Awaited<ReturnType<ReturnType<typeof Test.createTestingModule>['compile']>>;
  let dataSource: DataSource;
  let tokens: AccountTokensService;
  let userId: string;

  beforeAll(async () => {
    await resetTestDatabase();
    moduleRef = await Test.createTestingModule({
      imports: [AppConfigModule, DatabaseModule, TypeOrmModule.forFeature([AccountToken])],
      providers: [AccountTokensService],
    }).compile();
    await moduleRef.init();
    dataSource = moduleRef.get(DataSource);
    tokens = moduleRef.get(AccountTokensService);
  });
  afterAll(async () => {
    await moduleRef.close();
  });
  beforeEach(async () => {
    await dataSource.query('TRUNCATE users CASCADE');
    const user = await dataSource.getRepository(User).save({ email: 'a@example.com', passwordHash: 'x' });
    userId = user.id;
  });

  it('issues a token that works once for its purpose', async () => {
    const token = await tokens.issue(userId, 'confirm_email', 60);
    expect(await tokens.consume(token, 'reset_password')).toBeNull();
    expect(await tokens.consume(token, 'confirm_email')).toBe(userId);
    expect(await tokens.consume(token, 'confirm_email')).toBeNull();
  });

  it('stores only a hash of the token', async () => {
    const token = await tokens.issue(userId, 'reset_password', 60);
    const rows = await dataSource.getRepository(AccountToken).find();
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(token);
  });

  it('rejects expired and unknown tokens', async () => {
    const token = await tokens.issue(userId, 'reset_password', 60);
    await dataSource.query(`UPDATE account_tokens SET expires_at = now() - interval '1 minute'`);
    expect(await tokens.consume(token, 'reset_password')).toBeNull();
    expect(await tokens.consume('not-a-real-token', 'reset_password')).toBeNull();
  });

  it('lets only the newest token of a purpose work', async () => {
    const first = await tokens.issue(userId, 'reset_password', 60);
    const second = await tokens.issue(userId, 'reset_password', 60);
    expect(await tokens.consume(first, 'reset_password')).toBeNull();
    expect(await tokens.consume(second, 'reset_password')).toBe(userId);
  });

  it('is removed together with the user', async () => {
    await tokens.issue(userId, 'confirm_email', 60);
    await dataSource.query('DELETE FROM users');
    expect(await dataSource.getRepository(AccountToken).count()).toBe(0);
  });
});
