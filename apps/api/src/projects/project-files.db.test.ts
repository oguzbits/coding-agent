import { mkdir, rm, symlink, writeFile } from 'node:fs/promises';
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
const dotenv = `.${'env'}`;

type Agent = ReturnType<typeof request.agent>;

describe('project files (HTTP)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let alice: Agent;
  let bob: Agent;
  let projectId: string;
  let folder: string;

  const call = (agent: Agent, method: 'get' | 'post', url: string) =>
    agent[method](`/api${url}`).set('Host', 'localhost:3000');
  const put = async (relative: string, content: string | Buffer) => {
    await mkdir(path.dirname(path.join(folder, relative)), { recursive: true });
    await writeFile(path.join(folder, relative), content);
  };

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

  beforeEach(async () => {
    await dataSource.query('TRUNCATE users CASCADE');
    await dataSource.query('TRUNCATE auth_sessions');
    await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });
    const first = await login('alice@example.com');
    alice = first.agent;
    bob = (await login('bob@example.com')).agent;
    const project = await call(alice, 'post', '/projects').send({ name: 'Files demo' });
    projectId = project.body.id;
    folder = path.join(root, first.id, projectId);
  });

  describe('listing', () => {
    it('lists one folder level, folders first, without secrets and git internals', async () => {
      await put('src/a.ts', 'export {};');
      await put('README.md', '# hi');
      await put(dotenv, 'SECRET=hunter2');
      await put('.git/config', '[core]');
      const top = await call(alice, 'get', `/projects/${projectId}/files`);
      expect(top.status).toBe(200);
      expect(top.body.entries).toEqual([
        { name: 'src', path: 'src', type: 'directory' },
        { name: 'README.md', path: 'README.md', type: 'file', size: 4 },
      ]);
      const sub = await call(alice, 'get', `/projects/${projectId}/files?path=src`);
      expect(sub.body.entries).toEqual([{ name: 'a.ts', path: 'src/a.ts', type: 'file', size: 10 }]);
    });

    it('shows symlinks as such and does not follow them', async () => {
      await put('a.txt', 'x');
      await symlink(root, path.join(folder, 'out'));
      const listed = await call(alice, 'get', `/projects/${projectId}/files`);
      expect(listed.body.entries).toContainEqual({ name: 'out', path: 'out', type: 'symlink' });
      expect((await call(alice, 'get', `/projects/${projectId}/files?path=out`)).status).toBe(400);
    });

    it('rejects paths outside the project and files as folders', async () => {
      await put('a.txt', 'x');
      expect((await call(alice, 'get', `/projects/${projectId}/files?path=../..`)).status).toBe(400);
      expect((await call(alice, 'get', `/projects/${projectId}/files?path=a.txt`)).status).toBe(400);
      expect((await call(alice, 'get', `/projects/${projectId}/files?path=nope`)).status).toBe(404);
    });

    it('does not show another user’s project', async () => {
      expect((await call(bob, 'get', `/projects/${projectId}/files`)).status).toBe(404);
    });
  });

  describe('viewing a file', () => {
    it('returns the text of a file', async () => {
      await put('src/a.ts', 'const a = 1;\n');
      const viewed = await call(alice, 'get', `/projects/${projectId}/files/content?path=src/a.ts`);
      expect(viewed.status).toBe(200);
      expect(viewed.body).toEqual({ path: 'src/a.ts', content: 'const a = 1;\n', truncated: false });
    });

    it('cuts very large files and says so', async () => {
      await put('big.txt', 'x'.repeat(2000));
      const viewed = await call(alice, 'get', `/projects/${projectId}/files/content?path=big.txt`);
      expect(viewed.body.truncated).toBe(true);
      expect(viewed.body.content).toHaveLength(1000);
    });

    it('refuses secrets, binary files, folders and other users', async () => {
      await put(dotenv, 'SECRET=hunter2');
      await put('bin.dat', Buffer.from([1, 0, 2]));
      await put('dir/x.txt', 'x');
      const url = (file: string) => `/projects/${projectId}/files/content?path=${encodeURIComponent(file)}`;
      const secret = await call(alice, 'get', url(dotenv));
      expect(secret.status).toBe(400);
      expect(JSON.stringify(secret.body)).not.toContain('hunter2');
      expect((await call(alice, 'get', url('bin.dat'))).status).toBe(400);
      expect((await call(alice, 'get', url('dir'))).status).toBe(400);
      expect((await call(alice, 'get', url('missing.txt'))).status).toBe(404);
      expect((await call(bob, 'get', url('dir/x.txt'))).status).toBe(404);
    });
  });

  describe('download', () => {
    const download = (agent: Agent) =>
      call(agent, 'get', `/projects/${projectId}/download`)
        .buffer(true)
        .parse((res, done) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => done(null, Buffer.concat(chunks)));
        });

    it('streams a zip of the project without secrets, git internals and dependency folders', async () => {
      await put('src/a.ts', 'export {};');
      await put('README.md', '# hi');
      await put(dotenv, 'SECRET=hunter2');
      await put('.git/config', '[core]');
      await put('node_modules/pkg/index.js', '//');
      const response = await download(alice);
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('application/zip');
      expect(response.headers['content-disposition']).toContain('Files demo.zip');
      const bytes = response.body as Buffer;
      expect(bytes.subarray(0, 2).toString()).toBe('PK');
      const text = bytes.toString('latin1');
      expect(text).toContain('src/a.ts');
      expect(text).toContain('README.md');
      expect(text).not.toContain('hunter2');
      expect(text).not.toContain('.git/config');
      expect(text).not.toContain('node_modules');
    });

    it('returns an empty zip for an empty project and 404 for other users', async () => {
      expect((await download(alice)).status).toBe(200);
      expect((await download(bob)).status).toBe(404);
    });
  });
});
