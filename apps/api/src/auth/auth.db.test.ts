import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module.js';
import { configureApp } from '../app.setup.js';
import { validateEnv } from '../config/env.validation.js';
import { resetTestDatabase } from '../testing/test-database.js';

const email = 'alice@example.com';
const password = 'correct horse battery staple';

describe('accounts and login (HTTP)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  const agent = () => request.agent(app.getHttpServer());
  const post = (a: ReturnType<typeof agent>, url: string, body?: object) =>
    a.post(url).set('Host', 'localhost:3000').send(body);
  const get = (a: ReturnType<typeof agent>, url: string) => a.get(url).set('Host', 'localhost:3000');
  const cookieOf = (response: request.Response) => String(response.headers['set-cookie']?.[0] ?? '');

  async function registerAndLogin(address = email) {
    const a = agent();
    await post(a, '/api/auth/register', { email: address, password });
    const login = await post(a, '/api/auth/login', { email: address, password });
    return { a, login };
  }

  beforeAll(async () => {
    await resetTestDatabase();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app, validateEnv(process.env));
    await app.init();
    dataSource = app.get(DataSource);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await dataSource.query('TRUNCATE users CASCADE');
    await dataSource.query('TRUNCATE auth_sessions');
  });

  it('protects every route except the public ones', async () => {
    expect((await get(agent(), '/api/auth/me')).status).toBe(401);
    expect((await get(agent(), '/api/users/me/settings')).status).toBe(401);
    expect((await get(agent(), '/api/openapi.json')).status).toBe(200);
  });

  it('registers, logs in and returns the account without the password hash', async () => {
    const a = agent();
    expect((await post(a, '/api/auth/register', { email, password })).status).toBe(202);
    const login = await post(a, '/api/auth/login', { email: 'ALICE@example.com', password });
    expect(login.status).toBe(200);
    expect(login.body).toEqual({ id: expect.any(String), email, emailConfirmed: false, confirmationRequired: false });
    const me = await get(a, '/api/auth/me');
    expect(me.body).toEqual({ id: login.body.id, email, emailConfirmed: false, confirmationRequired: false });
    expect(JSON.stringify(me.body)).not.toMatch(/hash|argon/i);
  });

  it('sets a hardened cookie with its own name', async () => {
    const { login } = await registerAndLogin();
    const cookie = cookieOf(login);
    expect(cookie).toMatch(/^coding_agent\.sid=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
  });

  it('answers a wrong password and an unknown email identically', async () => {
    await registerAndLogin();
    const wrong = await post(agent(), '/api/auth/login', { email, password: 'wrong password 12345' });
    const unknown = await post(agent(), '/api/auth/login', { email: 'nobody@example.com', password });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
  });

  it('answers a registration for a taken email like a new one', async () => {
    await registerAndLogin();
    const again = await post(agent(), '/api/auth/register', { email, password });
    expect(again.status).toBe(202);
  });

  it('validates the registration input', async () => {
    expect((await post(agent(), '/api/auth/register', { email: 'not-an-email', password })).status).toBe(400);
    expect((await post(agent(), '/api/auth/register', { email, password: 'short' })).status).toBe(400);
    expect((await post(agent(), '/api/auth/register', { email, password, admin: true })).status).toBe(400);
  });

  it('issues a new session id on every login (no session fixation)', async () => {
    const { a, login } = await registerAndLogin();
    const second = await post(a, '/api/auth/login', { email, password });
    expect(cookieOf(second).split(';')[0]).not.toBe(cookieOf(login).split(';')[0]);
  });

  it('logs out and refuses the old cookie afterwards', async () => {
    const { a, login } = await registerAndLogin();
    const stale = cookieOf(login).split(';')[0];
    expect((await post(a, '/api/auth/logout')).status).toBe(204);
    expect((await get(a, '/api/auth/me')).status).toBe(401);
    expect((await get(agent(), '/api/auth/me').set('Cookie', stale)).status).toBe(401);
  });

  it('ends a login after the fixed maximum lifetime', async () => {
    const { a } = await registerAndLogin();
    await dataSource.query(`UPDATE auth_sessions SET sess = jsonb_set(sess::jsonb, '{createdAt}', '1000')::json`);
    expect((await get(a, '/api/auth/me')).status).toBe(401);
  });

  it('changes the password, keeps this login and ends all other logins', async () => {
    const { a } = await registerAndLogin();
    const other = agent();
    await post(other, '/api/auth/login', { email, password });
    expect((await get(other, '/api/auth/me')).status).toBe(200);

    const wrong = await post(a, '/api/auth/change-password', {
      currentPassword: 'nope nope nope nope',
      newPassword: 'a brand new password',
    });
    expect(wrong.status).toBe(403);
    const changed = await post(a, '/api/auth/change-password', {
      currentPassword: password,
      newPassword: 'a brand new password',
    });
    expect(changed.status).toBe(204);

    expect((await get(a, '/api/auth/me')).status).toBe(200);
    expect((await get(other, '/api/auth/me')).status).toBe(401);
    expect((await post(agent(), '/api/auth/login', { email, password })).status).toBe(401);
    expect((await post(agent(), '/api/auth/login', { email, password: 'a brand new password' })).status).toBe(200);
  });

  it('stores the Gemini key encrypted and never returns it', async () => {
    const { a } = await registerAndLogin();
    expect((await get(a, '/api/users/me/settings')).body).toEqual({
      hasGeminiKey: false,
      geminiKeyLast4: null,
      modelName: null,
      limits: { requestsPerMinute: null, tokensPerMinute: null, requestsPerDay: null },
    });
    const put = await a
      .put('/api/users/me/gemini-key')
      .set('Host', 'localhost:3000')
      .send({ apiKey: 'AIzaSyExampleKey-1234' });
    expect(put.status).toBe(204);
    const settings = await get(a, '/api/users/me/settings');
    expect(settings.body).toMatchObject({ hasGeminiKey: true, geminiKeyLast4: '1234', modelName: null });
    expect(JSON.stringify(settings.body)).not.toContain('AIzaSy');
    expect((await a.delete('/api/users/me/gemini-key').set('Host', 'localhost:3000')).status).toBe(204);
    expect((await get(a, '/api/users/me/settings')).body.hasGeminiKey).toBe(false);
  });

  it('sets the model name and limits and validates them', async () => {
    const { a } = await registerAndLogin();
    const put = (body: object) => a.put('/api/users/me/model').set('Host', 'localhost:3000').send(body);
    expect((await put({ modelName: 'my-model', requestsPerMinute: 12, requestsPerDay: 300 })).status).toBe(204);
    expect((await get(a, '/api/users/me/settings')).body).toMatchObject({
      modelName: 'my-model',
      limits: { requestsPerMinute: 12, tokensPerMinute: null, requestsPerDay: 300 },
    });
    expect((await put({ modelName: null, requestsPerMinute: null })).status).toBe(204);
    expect((await get(a, '/api/users/me/settings')).body).toMatchObject({
      modelName: null,
      limits: { requestsPerMinute: null, requestsPerDay: 300 },
    });
    expect((await put({ modelName: 'has space' })).status).toBe(400);
    expect((await put({ requestsPerMinute: 0 })).status).toBe(400);
    expect((await put({ requestsPerMinute: 1.5 })).status).toBe(400);
    expect((await put({ requestsPerDay: 'many' })).status).toBe(400);
    expect((await put({ unknown: 1 })).status).toBe(400);
  });

  it('rejects keys with whitespace or absurd length', async () => {
    const { a } = await registerAndLogin();
    const put = (apiKey: string) => a.put('/api/users/me/gemini-key').set('Host', 'localhost:3000').send({ apiKey });
    expect((await put('has space in it 1234567890')).status).toBe(400);
    expect((await put('x'.repeat(500))).status).toBe(400);
    expect((await put('')).status).toBe(400);
  });
});
