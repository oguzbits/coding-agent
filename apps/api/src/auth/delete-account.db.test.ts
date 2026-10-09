import { access } from 'node:fs/promises';
import path from 'node:path';
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
const workspaces = path.resolve(process.env.WORKSPACES_DIR ?? '');

const exists = (target: string) =>
  access(target).then(
    () => true,
    () => false,
  );

describe('deleting the own account (HTTP)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  type Agent = ReturnType<typeof request.agent>;
  const call = (a: Agent, method: 'get' | 'post' | 'delete', url: string, body?: object) =>
    a[method](`/api${url}`).set('Host', 'localhost:3000').send(body);
  const count = async (table: string): Promise<number> =>
    Number((await dataSource.query(`SELECT count(*) AS n FROM ${table}`))[0].n);

  async function accountWithProject(address = email) {
    const a = request.agent(app.getHttpServer());
    await call(a, 'post', '/auth/register', { email: address, password });
    const login = await call(a, 'post', '/auth/login', { email: address, password });
    const project = await call(a, 'post', '/projects', { name: 'P' });
    await call(a, 'post', '/conversations', { projectId: project.body.id });
    return { a, userId: login.body.id as string, projectId: project.body.id as string };
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

  it('needs the right password and deletes nothing without it', async () => {
    const { a, userId, projectId } = await accountWithProject();

    expect((await call(a, 'delete', '/auth/account', { password: 'wrong wrong wrong' })).status).toBe(403);

    expect(await count('users')).toBe(1);
    expect(await exists(path.join(workspaces, userId, projectId))).toBe(true);
    expect((await call(a, 'get', '/auth/me')).status).toBe(200);
  });

  it('removes the account with its data and files, and ends the login', async () => {
    const { a, userId } = await accountWithProject();
    const other = await accountWithProject('bob@example.com');

    expect((await call(a, 'delete', '/auth/account', { password })).status).toBe(204);

    expect((await call(a, 'get', '/auth/me')).status).toBe(401);
    expect(await exists(path.join(workspaces, userId))).toBe(false);
    expect(await dataSource.query('SELECT 1 FROM users WHERE id = $1', [userId])).toHaveLength(0);
    expect(await dataSource.query('SELECT 1 FROM projects WHERE user_id = $1', [userId])).toHaveLength(0);
    expect(await dataSource.query('SELECT 1 FROM conversations WHERE user_id = $1', [userId])).toHaveLength(0);
    expect((await call(request.agent(app.getHttpServer()), 'post', '/auth/login', { email, password })).status).toBe(
      401,
    );
    // The other account is untouched.
    expect((await call(other.a, 'get', '/auth/me')).status).toBe(200);
    expect(await exists(path.join(workspaces, other.userId, other.projectId))).toBe(true);
  });

  it('ends the logins on other devices too', async () => {
    const { a } = await accountWithProject();
    const second = request.agent(app.getHttpServer());
    await call(second, 'post', '/auth/login', { email, password });

    await call(a, 'delete', '/auth/account', { password });

    expect((await call(second, 'get', '/auth/me')).status).toBe(401);
  });
});
