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

describe('own logins (HTTP)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  type Agent = ReturnType<typeof request.agent>;
  const call = (a: Agent, method: 'get' | 'post' | 'delete', url: string, body?: object) =>
    a[method](`/api${url}`).set('Host', 'localhost:3000').send(body);

  async function loginFrom(userAgent: string, address = email): Promise<Agent> {
    const a = request.agent(app.getHttpServer());
    await a.post('/api/auth/register').set('Host', 'localhost:3000').send({ email: address, password });
    await a
      .post('/api/auth/login')
      .set('Host', 'localhost:3000')
      .set('User-Agent', userAgent)
      .send({ email: address, password });
    return a;
  }
  const listed = async (a: Agent) => (await call(a, 'get', '/auth/sessions')).body as Array<Record<string, unknown>>;

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

  it('lists the own logins with device and marks the current one, without exposing the session id', async () => {
    const laptop = await loginFrom('Laptop Browser');
    await loginFrom('Phone Browser');

    const sessions = await listed(laptop);

    expect(sessions).toHaveLength(2);
    expect(sessions.filter((s) => s.current)).toEqual([expect.objectContaining({ userAgent: 'Laptop Browser' })]);
    expect(sessions.map((s) => s.userAgent).sort()).toEqual(['Laptop Browser', 'Phone Browser']);
    const raw = await dataSource.query('SELECT sid FROM auth_sessions');
    for (const { sid } of raw) expect(JSON.stringify(sessions)).not.toContain(sid);
  });

  it('shows no logins of other users', async () => {
    const laptop = await loginFrom('Laptop Browser');
    await loginFrom('Other Browser', 'bob@example.com');
    expect(await listed(laptop)).toHaveLength(1);
  });

  it('ends one other login and the owner of it is logged out', async () => {
    const laptop = await loginFrom('Laptop Browser');
    const phone = await loginFrom('Phone Browser');
    const other = (await listed(laptop)).find((s) => !s.current);

    expect((await call(laptop, 'delete', `/auth/sessions/${other?.id}`)).status).toBe(204);

    expect((await call(phone, 'get', '/auth/me')).status).toBe(401);
    expect((await call(laptop, 'get', '/auth/me')).status).toBe(200);
  });

  it('cannot end a login of another user', async () => {
    const laptop = await loginFrom('Laptop Browser');
    const bob = await loginFrom('Bob Browser', 'bob@example.com');
    const bobsId = (await listed(bob))[0].id;

    expect((await call(laptop, 'delete', `/auth/sessions/${bobsId}`)).status).toBe(404);
    expect((await call(bob, 'get', '/auth/me')).status).toBe(200);
  });

  it('ends all other logins at once and keeps the current one', async () => {
    const laptop = await loginFrom('Laptop Browser');
    const phone = await loginFrom('Phone Browser');
    await loginFrom('Tablet Browser');

    expect((await call(laptop, 'delete', '/auth/sessions')).status).toBe(204);

    expect(await listed(laptop)).toHaveLength(1);
    expect((await call(phone, 'get', '/auth/me')).status).toBe(401);
  });
});
