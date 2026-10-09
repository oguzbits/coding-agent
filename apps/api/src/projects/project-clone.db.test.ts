import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { access } from 'node:fs/promises';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module.js';
import { configureApp } from '../app.setup.js';
import { validateEnv } from '../config/env.validation.js';
import { resetTestDatabase } from '../testing/test-database.js';

/**
 * The app reads its settings when the module is imported, so the environment must be ready before the imports run.
 * The fake git stands in for git: the URL decides what happens, so no network is needed.
 */
const { tools, saved } = await vi.hoisted(async () => {
  const { chmodSync, mkdtempSync, writeFileSync } = await import('node:fs');
  const FAKE_GIT = `#!/bin/sh
if [ "$1" = "--version" ]; then echo "git version 2.51.0"; exit 0; fi
for last; do :; done
URL=$(printf '%s\\n' "$@" | tail -n 2 | head -n 1)
case "$URL" in
  *broken*) echo "fatal: repository not found" >&2; exit 128 ;;
  *slow*) mkdir -p "$last"; sleep 30; exit 0 ;;
  *big*) mkdir -p "$last"; head -c 200000 /dev/zero > "$last/blob"; exit 0 ;;
esac
mkdir -p "$last/.git" && echo cloned > "$last/README.md" && echo "[core]" > "$last/.git/config"
`;
  const dir = mkdtempSync(`${process.env.TMPDIR ?? '/tmp'}/fake-git-`);
  writeFileSync(`${dir}/git`, FAKE_GIT);
  chmodSync(`${dir}/git`, 0o755);
  const values = { GIT_BINARY: `${dir}/git`, PROJECT_CLONE_MAX_BYTES: '100000', USER_STORAGE_MAX_BYTES: '300000' };
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    process.env[key] = value;
  }
  return { tools: dir, saved: previous };
});

const password = 'correct horse battery staple';
const rootEnv = process.env.WORKSPACES_DIR ?? '';
// The tests delete this directory, so refuse to run against anything that is not clearly a test directory.
if (!rootEnv.includes('coding-agent-test')) throw new Error('WORKSPACES_DIR must be a coding-agent-test dir');
const root = path.resolve(rootEnv);

type Agent = ReturnType<typeof request.agent>;

describe('cloning a project (HTTP)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let alice: Agent;
  let aliceId: string;

  const call = (agent: Agent, method: 'get' | 'post', url: string) =>
    agent[method](`/api${url}`).set('Host', 'localhost:3000');
  const exists = (target: string) =>
    access(target).then(
      () => true,
      () => false,
    );

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
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(tools, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE users CASCADE');
    await dataSource.query('TRUNCATE auth_sessions');
    await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });
    alice = request.agent(app.getHttpServer());
    await call(alice, 'post', '/auth/register').send({ email: 'alice@example.com', password });
    aliceId = (await call(alice, 'post', '/auth/login').send({ email: 'alice@example.com', password })).body.id;
  });

  const clone = (url: string) => call(alice, 'post', '/projects').send({ name: 'Cloned', cloneUrl: url });
  const projectCount = async () => (await call(alice, 'get', '/projects')).body.length;

  it('clones a repository into the project folder and remembers where it came from', async () => {
    const created = await clone('https://github.com/octocat/Hello-World.git');
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Cloned', origin: 'https://github.com/octocat/Hello-World.git' });
    const folder = path.join(root, aliceId, created.body.id);
    expect(await exists(path.join(folder, 'README.md'))).toBe(true);
    const files = await call(alice, 'get', `/projects/${created.body.id}/files`);
    expect(files.body.entries.map((entry: { name: string }) => entry.name)).toEqual(['README.md']);
  });

  it.each([
    ['http://github.com/a/b', 'https'],
    ['https://user:token@github.com/a/b', 'user name'],
    ['git@github.com:a/b.git', 'https'],
  ])('refuses %s and creates nothing', async (url, message) => {
    const refused = await clone(url);
    expect(refused.status).toBe(400);
    expect(JSON.stringify(refused.body)).toContain(message);
    expect(await projectCount()).toBe(0);
  });

  it('reports a failing clone and leaves no project or folder behind', async () => {
    const failed = await clone('https://github.com/a/broken');
    expect(failed.status).toBe(422);
    expect(JSON.stringify(failed.body)).toContain('repository not found');
    expect(await projectCount()).toBe(0);
    expect(await exists(path.join(root, aliceId))).toBe(false);
  });

  it('stops cloning and cleans up when the client goes away', async () => {
    const pending = call(alice, 'post', '/projects').send({ name: 'Cloned', cloneUrl: 'https://github.com/a/slow' });
    pending.end(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 500));
    pending.abort();

    // While the clone still ran, a second one would be refused with 409.
    await vi.waitFor(async () => expect((await clone('https://github.com/a/small')).status).toBe(201), {
      timeout: 5000,
      interval: 200,
    });
    expect(await projectCount()).toBe(1);
  });

  it('refuses a repository above the size limit', async () => {
    const big = await clone('https://github.com/a/big');
    expect(big.status).toBe(413);
    expect(await projectCount()).toBe(0);
  });

  it('refuses to clone when the storage of the user is used up', async () => {
    const existing = await call(alice, 'post', '/projects').send({ name: 'Full' });
    await writeFile(path.join(root, aliceId, existing.body.id, 'blob'), Buffer.alloc(300_000));
    const refused = await clone('https://github.com/a/small');
    expect(refused.status).toBe(413);
    expect(JSON.stringify(refused.body)).toMatch(/storage/i);
    expect(await projectCount()).toBe(1);
  });

  it('keeps empty projects possible when the storage is used up', async () => {
    const existing = await call(alice, 'post', '/projects').send({ name: 'Full' });
    await writeFile(path.join(root, aliceId, existing.body.id, 'blob'), Buffer.alloc(300_000));
    expect((await call(alice, 'post', '/projects').send({ name: 'Empty' })).status).toBe(201);
  });
});
