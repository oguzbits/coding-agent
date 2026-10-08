import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppConfigModule } from '../config/app-config.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { resetTestDatabase } from '../testing/test-database.js';
import { EmailTakenError, RegistrationClosedError, UsersService } from './users.service.js';
import { REGISTRATION_OPEN, UsersModule } from './users.module.js';

const password = 'correct horse battery staple';

async function createService(registrationOpen: boolean) {
  const builder = Test.createTestingModule({ imports: [AppConfigModule, DatabaseModule, UsersModule] });
  const moduleRef = await builder.overrideProvider(REGISTRATION_OPEN).useValue(registrationOpen).compile();
  await moduleRef.init();
  return { moduleRef, users: moduleRef.get(UsersService), dataSource: moduleRef.get(DataSource) };
}

describe('UsersService (registration open)', () => {
  let ctx: Awaited<ReturnType<typeof createService>>;

  beforeAll(async () => {
    await resetTestDatabase();
    ctx = await createService(true);
  });
  afterAll(async () => {
    await ctx.moduleRef.close();
  });
  beforeEach(async () => {
    await ctx.dataSource.query('TRUNCATE users CASCADE');
  });

  it('registers a user with a lowercased email and an Argon2id hash', async () => {
    const user = await ctx.users.register('Alice@Example.COM', password);
    expect(user.email).toBe('alice@example.com');
    const [row] = await ctx.dataSource.query('select password_hash from users where id = $1', [user.id]);
    expect(row.password_hash).toMatch(/^\$argon2id\$/);
    expect(row.password_hash).not.toContain(password);
  });

  it('rejects a second registration of the same email regardless of case', async () => {
    await ctx.users.register('alice@example.com', password);
    await expect(ctx.users.register('ALICE@example.com', password)).rejects.toBeInstanceOf(EmailTakenError);
  });

  it('authenticates with the right password only', async () => {
    const registered = await ctx.users.register('alice@example.com', password);
    expect((await ctx.users.authenticate('Alice@example.com', password))?.id).toBe(registered.id);
    expect(await ctx.users.authenticate('alice@example.com', 'wrong password!!')).toBeNull();
    expect(await ctx.users.authenticate('nobody@example.com', password)).toBeNull();
  });

  it('changes the password only when the current one is right', async () => {
    const user = await ctx.users.register('alice@example.com', password);
    expect(await ctx.users.changePassword(user.id, 'not the current one', 'a brand new password')).toBe(false);
    expect(await ctx.users.changePassword(user.id, password, 'a brand new password')).toBe(true);
    expect(await ctx.users.authenticate('alice@example.com', password)).toBeNull();
    expect(await ctx.users.authenticate('alice@example.com', 'a brand new password')).not.toBeNull();
  });

  it('stores the Gemini key encrypted and reports only the last four characters', async () => {
    const user = await ctx.users.register('alice@example.com', password);
    expect(await ctx.users.getSettings(user.id)).toEqual({
      hasGeminiKey: false,
      geminiKeyLast4: null,
      modelName: null,
    });

    await ctx.users.setGeminiKey(user.id, 'AIzaSyExampleKey-1234');
    expect(await ctx.users.getSettings(user.id)).toEqual({
      hasGeminiKey: true,
      geminiKeyLast4: '1234',
      modelName: null,
    });
    expect(await ctx.users.getGeminiKey(user.id)).toBe('AIzaSyExampleKey-1234');

    const rows = await ctx.dataSource.query('select * from user_settings where user_id = $1', [user.id]);
    expect(JSON.stringify(rows)).not.toContain('AIzaSyExampleKey');
    expect(rows[0].gemini_key_version).toBe(1);
  });

  it('removes the key and keeps the model name', async () => {
    const user = await ctx.users.register('alice@example.com', password);
    await ctx.users.setGeminiKey(user.id, 'AIzaSyExampleKey-1234');
    await ctx.users.setModelName(user.id, 'gemini-custom');
    await ctx.users.clearGeminiKey(user.id);
    expect(await ctx.users.getGeminiKey(user.id)).toBeNull();
    expect(await ctx.users.getSettings(user.id)).toEqual({
      hasGeminiKey: false,
      geminiKeyLast4: null,
      modelName: 'gemini-custom',
    });
  });

  it('does not hand out the key of another user', async () => {
    const alice = await ctx.users.register('alice@example.com', password);
    const bob = await ctx.users.register('bob@example.com', password);
    await ctx.users.setGeminiKey(alice.id, 'AIzaSyAliceKey-0001');
    expect(await ctx.users.getGeminiKey(bob.id)).toBeNull();
  });

  it('deletes settings together with the user', async () => {
    const user = await ctx.users.register('alice@example.com', password);
    await ctx.users.setGeminiKey(user.id, 'AIzaSyExampleKey-1234');
    await ctx.dataSource.query('DELETE FROM users WHERE id = $1', [user.id]);
    expect(await ctx.dataSource.query('select 1 from user_settings')).toEqual([]);
  });
});

describe('UsersService (registration closed)', () => {
  let ctx: Awaited<ReturnType<typeof createService>>;

  beforeAll(async () => {
    await resetTestDatabase();
    ctx = await createService(false);
  });
  afterAll(async () => {
    await ctx.moduleRef.close();
  });
  beforeEach(async () => {
    await ctx.dataSource.query('TRUNCATE users CASCADE');
  });

  it('always allows the first account', async () => {
    await expect(ctx.users.register('first@example.com', password)).resolves.toMatchObject({
      email: 'first@example.com',
    });
  });

  it('refuses every further account', async () => {
    await ctx.users.register('first@example.com', password);
    await expect(ctx.users.register('second@example.com', password)).rejects.toBeInstanceOf(RegistrationClosedError);
  });
});
