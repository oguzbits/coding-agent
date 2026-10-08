import { access, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module.js';
import { configureApp } from '../app.setup.js';
import { validateEnv } from '../config/env.validation.js';
import { resetTestDatabase } from '../testing/test-database.js';

const password = 'correct horse battery staple';
const rootEnv = process.env.WORKSPACES_DIR ?? '';
// The tests delete this directory, so refuse to run against anything that is not clearly a test directory.
if (!rootEnv.includes('coding-agent-test')) throw new Error('WORKSPACES_DIR must be a coding-agent-test dir');
const root = path.resolve(rootEnv);

type Agent = ReturnType<typeof request.agent>;

describe('projects (HTTP)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let alice: Agent;
  let bob: Agent;
  let aliceId: string;

  const call = (agent: Agent, method: 'get' | 'post' | 'patch' | 'delete', url: string) =>
    agent[method](`/api${url}`).set('Host', 'localhost:3000');
  const exists = (target: string) =>
    access(target).then(
      () => true,
      () => false,
    );

  async function login(email: string): Promise<{ agent: Agent; id: string }> {
    const agent = request.agent(app.getHttpServer());
    await call(agent, 'post', '/auth/register').send({ email, password });
    const response = await call(agent, 'post', '/auth/login').send({ email, password });
    return { agent, id: response.body.id };
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
  // A run started by a test may still be writing; the next test's TRUNCATE would deadlock with it.
  afterEach(async () => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const [{ n }] = await dataSource.query(
        `SELECT count(*)::int AS n FROM runs WHERE state IN ('running', 'awaiting_approval')`,
      );
      if (n === 0) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE users CASCADE');
    await dataSource.query('TRUNCATE auth_sessions');
    await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });
    const first = await login('alice@example.com');
    alice = first.agent;
    aliceId = first.id;
    bob = (await login('bob@example.com')).agent;
  });

  it('creates an empty project with its own folder under <root>/<user>/<project>', async () => {
    const created = await call(alice, 'post', '/projects').send({ name: 'My app' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'My app', origin: 'empty' });
    expect(await exists(path.join(root, aliceId, created.body.id))).toBe(true);
  });

  it('lists, renames and deletes only the own projects', async () => {
    const { body } = await call(alice, 'post', '/projects').send({ name: 'One' });
    expect((await call(alice, 'get', '/projects')).body).toMatchObject([{ id: body.id, name: 'One' }]);
    expect((await call(bob, 'get', '/projects')).body).toEqual([]);
    expect((await call(bob, 'patch', `/projects/${body.id}`).send({ name: 'x' })).status).toBe(404);
    expect((await call(bob, 'delete', `/projects/${body.id}`)).status).toBe(404);

    const renamed = await call(alice, 'patch', `/projects/${body.id}`).send({ name: 'Two' });
    expect(renamed.body.name).toBe('Two');
    expect(await exists(path.join(root, aliceId, body.id))).toBe(true); // renaming never touches the folder
  });

  it('validates names', async () => {
    expect((await call(alice, 'post', '/projects').send({ name: '' })).status).toBe(400);
    expect((await call(alice, 'post', '/projects').send({ name: 'x'.repeat(101) })).status).toBe(400);
    expect((await call(alice, 'post', '/projects').send({ name: 'ok', origin: 'https://evil' })).status).toBe(400);
  });

  it('deletes the folder and the conversations of a project', async () => {
    const { body: project } = await call(alice, 'post', '/projects').send({ name: 'Gone' });
    await writeFile(path.join(root, aliceId, project.id, 'file.txt'), 'x');
    const conversation = await call(alice, 'post', '/conversations').send({ projectId: project.id });
    expect(conversation.status).toBe(201);
    expect((await call(alice, 'delete', `/projects/${project.id}`)).status).toBe(204);
    expect(await exists(path.join(root, aliceId, project.id))).toBe(false);
    expect((await call(alice, 'get', `/conversations/${conversation.body.id}`)).status).toBe(404);
    expect(await readdir(path.join(root, aliceId))).toEqual([]);
  });

  it('stops an active run before the project goes away', async () => {
    const { body: project } = await call(alice, 'post', '/projects').send({ name: 'Busy' });
    const { body: conversation } = await call(alice, 'post', '/conversations').send({ projectId: project.id });
    await call(alice, 'post', `/conversations/${conversation.id}/messages`).send({ text: 'slow' });
    expect((await call(alice, 'delete', `/projects/${project.id}`)).status).toBe(204);
    const next = await call(alice, 'post', '/projects').send({ name: 'Next' });
    const again = await call(alice, 'post', '/conversations').send({ projectId: next.body.id });
    expect((await call(alice, 'post', `/conversations/${again.body.id}/messages`).send({ text: 'hi' })).status).toBe(
      202,
    );
  });

  it('only allows conversations in own projects', async () => {
    const { body: project } = await call(alice, 'post', '/projects').send({ name: 'Mine' });
    expect((await call(bob, 'post', '/conversations').send({ projectId: project.id })).status).toBe(404);
    expect((await call(alice, 'post', '/conversations').send({})).status).toBe(400);
    const listed = await call(alice, 'get', `/conversations?projectId=${project.id}`);
    expect(listed.body).toEqual([]);
  });
});
