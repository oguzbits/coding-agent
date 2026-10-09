import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module.js';
import { configureApp } from '../app.setup.js';
import { validateEnv } from '../config/env.validation.js';
import { resetTestDatabase } from '../testing/test-database.js';
import { RunsService } from './runs.service.js';

const password = 'correct horse battery staple';
const workspaceEnv = process.env.WORKSPACES_DIR ?? '';
// The tests delete this directory, so refuse to run against anything that is not clearly a test directory.
if (!workspaceEnv.includes('coding-agent-test')) throw new Error('WORKSPACES_DIR must be a coding-agent-test dir');
const workspacesRoot = path.resolve(workspaceEnv);

type Agent = ReturnType<typeof request.agent>;
type StoredEvent = { seq: number; type: string; payload: Record<string, unknown> };

describe('conversations and runs (HTTP, fake model)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let alice: Agent;
  let bob: Agent;
  let aliceCookie = '';

  const call = (agent: Agent, method: 'get' | 'post' | 'patch' | 'delete', url: string) =>
    agent[method](`/api${url}`).set('Host', 'localhost:3000');

  async function login(email: string): Promise<{ agent: Agent; cookie: string }> {
    const agent = request.agent(app.getHttpServer());
    await call(agent, 'post', '/auth/register').send({ email, password });
    const response = await call(agent, 'post', '/auth/login').send({ email, password });
    return { agent, cookie: String(response.headers['set-cookie']?.[0] ?? '').split(';')[0] };
  }
  const createConversation = async (agent: Agent, title?: string): Promise<string> => {
    const project = await call(agent, 'post', '/projects').send({ name: 'Test project' });
    const created = await call(agent, 'post', '/conversations').send({
      projectId: project.body.id,
      ...(title ? { title } : {}),
    });
    return created.body.id;
  };
  /** The folder the agent works in for this conversation. */
  const workspaceOf = async (id: string): Promise<string> => {
    const [row] = await dataSource.query('SELECT user_id, project_id FROM conversations WHERE id = $1', [id]);
    return path.join(workspacesRoot, row.user_id, row.project_id);
  };
  const send = (agent: Agent, id: string, text: string) =>
    call(agent, 'post', `/conversations/${id}/messages`).send({ text });
  const events = async (id: string): Promise<StoredEvent[]> =>
    dataSource.query('SELECT seq, type, payload FROM run_events WHERE conversation_id = $1 ORDER BY seq', [id]);
  const runState = async (id: string): Promise<string | undefined> =>
    (await dataSource.query('SELECT state FROM runs WHERE conversation_id = $1 ORDER BY started_at DESC', [id]))[0]
      ?.state;

  async function until<T>(read: () => Promise<T | undefined | false>, what: string): Promise<T> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const value = await read();
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`Timed out waiting for ${what}`);
  }
  const waitForEvent = (id: string, type: string) =>
    until(async () => (await events(id)).find((event) => event.type === type), `event ${type}`);
  const waitForState = (id: string, state: string) =>
    until(async () => (await runState(id)) === state, `run state ${state}`);

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
    await rm(workspacesRoot, { recursive: true, force: true });
    await mkdir(workspacesRoot, { recursive: true });
    const first = await login('alice@example.com');
    alice = first.agent;
    aliceCookie = first.cookie;
    bob = (await login('bob@example.com')).agent;
  });

  describe('conversations', () => {
    it('creates, lists, renames and deletes conversations of the logged-in user only', async () => {
      const id = await createConversation(alice, 'First');
      expect((await call(alice, 'get', '/conversations')).body).toMatchObject([{ id, title: 'First' }]);
      expect((await call(bob, 'get', '/conversations')).body).toEqual([]);
      expect((await call(bob, 'get', `/conversations/${id}`)).status).toBe(404);
      expect((await call(bob, 'patch', `/conversations/${id}`).send({ title: 'x' })).status).toBe(404);
      expect((await call(bob, 'delete', `/conversations/${id}`)).status).toBe(404);

      expect((await call(alice, 'patch', `/conversations/${id}`).send({ title: 'Renamed' })).body.title).toBe(
        'Renamed',
      );
      expect((await call(alice, 'delete', `/conversations/${id}`)).status).toBe(204);
      expect((await call(alice, 'get', `/conversations/${id}`)).status).toBe(404);
    });

    it('validates input and rejects malformed ids', async () => {
      expect((await call(alice, 'post', '/conversations').send({ title: '' })).status).toBe(400);
      expect((await call(alice, 'post', '/conversations').send({ title: 'x', extra: 1 })).status).toBe(400);
      expect((await call(alice, 'get', '/conversations/not-a-uuid')).status).toBe(400);
    });

    it('requires login', async () => {
      const anonymous = request.agent(app.getHttpServer());
      expect((await call(anonymous, 'get', '/conversations')).status).toBe(401);
    });
  });

  describe('runs', () => {
    it('answers a message and stores numbered events and the unchanged history', async () => {
      const id = await createConversation(alice);
      const response = await send(alice, id, 'hello');
      expect(response.status).toBe(202);
      expect(response.body.runId).toEqual(expect.any(String));
      await waitForState(id, 'finished');

      const stored = await events(id);
      expect(stored.map((event) => event.seq)).toEqual([1, 2, 3, 4]);
      expect(stored.map((event) => event.type)).toEqual([
        'run_started',
        'user_message',
        'assistant_message',
        'run_finished',
      ]);
      expect(stored[1].payload).toMatchObject({ text: 'hello' });
      expect(stored[2].payload).toMatchObject({ text: 'You said: hello' });

      const messages = await dataSource.query(
        'SELECT role, parts FROM messages WHERE conversation_id = $1 ORDER BY id',
        [id],
      );
      expect(messages).toEqual([
        { role: 'user', parts: [{ text: 'hello' }] },
        { role: 'model', parts: [{ text: 'You said: hello' }] },
      ]);
      const [run] = await dataSource.query('SELECT end_reason, ended_at FROM runs WHERE conversation_id = $1', [id]);
      expect(run.end_reason).toBe('finished');
      expect(run.ended_at).not.toBeNull();
    });

    it('titles a new conversation after its first message', async () => {
      const id = await createConversation(alice);
      await send(alice, id, 'Fix the failing test in the parser');
      await waitForState(id, 'finished');
      expect((await call(alice, 'get', `/conversations/${id}`)).body.title).toBe('Fix the failing test in the parser');
    });

    it('continues a conversation with the earlier history', async () => {
      const id = await createConversation(alice);
      await send(alice, id, 'one');
      await waitForState(id, 'finished');
      await send(alice, id, 'two');
      await until(async () => (await events(id)).filter((e) => e.type === 'run_finished').length === 2, 'second run');
      const seqs = (await events(id)).map((event) => event.seq);
      expect(seqs).toEqual(seqs.map((_, index) => index + 1));
      const count = await dataSource.query('SELECT count(*)::int AS n FROM messages WHERE conversation_id = $1', [id]);
      expect(count[0].n).toBe(4);
    });

    it('runs a read tool inside the workspace and returns the file to the model', async () => {
      const id = await createConversation(alice);
      await writeFile(path.join(await workspaceOf(id), 'hello.txt'), 'file content');
      await send(alice, id, 'read hello.txt');
      await waitForState(id, 'finished');
      const stored = await events(id);
      expect(stored.map((event) => event.type)).toEqual([
        'run_started',
        'user_message',
        'tool_call',
        'tool_result',
        'assistant_message',
        'run_finished',
      ]);
      expect(stored[3].payload).toMatchObject({ isError: false, output: '     1\tfile content' });
    });

    it('gives the model an error instead of a protected file', async () => {
      const id = await createConversation(alice);
      await writeFile(path.join(await workspaceOf(id), '.env'), 'SECRET=hunter2');
      await send(alice, id, 'read .env');
      await waitForState(id, 'finished');
      const result = (await events(id)).find((event) => event.type === 'tool_result');
      expect(result?.payload).toMatchObject({ isError: true });
      expect(JSON.stringify(await events(id))).not.toContain('hunter2');
    });

    it('waits for approval, then runs the approved action', async () => {
      const id = await createConversation(alice);
      await send(alice, id, 'write NOTES.md buy milk');
      const requested = await waitForEvent(id, 'approval_requested');
      await waitForState(id, 'awaiting_approval');
      expect(requested.payload).toMatchObject({ name: 'write_file', preview: expect.stringContaining('+buy milk') });
      const active = (await call(alice, 'get', `/conversations/${id}`)).body.activeRun;
      expect(active).toMatchObject({ state: 'awaiting_approval', pendingApproval: { name: 'write_file' } });

      const callId = String(requested.payload.callId);
      expect((await call(bob, 'post', `/conversations/${id}/approvals`).send({ callId, approved: true })).status).toBe(
        404,
      );
      const answer = await call(alice, 'post', `/conversations/${id}/approvals`).send({ callId, approved: true });
      expect(answer.status).toBe(204);
      await waitForState(id, 'finished');
      expect(await readFile(path.join(await workspaceOf(id), 'NOTES.md'), 'utf8')).toBe('buy milk');
    });

    it('does not run a declined action', async () => {
      const id = await createConversation(alice);
      await send(alice, id, 'write NOTES.md secret plan');
      const requested = await waitForEvent(id, 'approval_requested');
      await call(alice, 'post', `/conversations/${id}/approvals`).send({
        callId: String(requested.payload.callId),
        approved: false,
      });
      await waitForState(id, 'finished');
      await expect(readFile(path.join(await workspaceOf(id), 'NOTES.md'), 'utf8')).rejects.toThrow();
    });

    it('changes the permission mode and rejects unknown modes', async () => {
      const id = await createConversation(alice);
      expect((await call(alice, 'get', `/conversations/${id}`)).body.mode).toBe('ask');
      const changed = await call(alice, 'patch', `/conversations/${id}`).send({ mode: 'auto_edit' });
      expect(changed.body).toMatchObject({ mode: 'auto_edit' });
      expect((await call(alice, 'patch', `/conversations/${id}`).send({ mode: 'yolo' })).status).toBe(400);
      expect((await call(bob, 'patch', `/conversations/${id}`).send({ mode: 'plan' })).status).toBe(404);
    });

    it('applies file edits without asking in auto_edit mode', async () => {
      const id = await createConversation(alice);
      await call(alice, 'patch', `/conversations/${id}`).send({ mode: 'auto_edit' });
      await send(alice, id, 'write NOTES.md buy milk');
      await waitForState(id, 'finished');
      expect((await events(id)).map((event) => event.type)).not.toContain('approval_requested');
      expect(await readFile(path.join(await workspaceOf(id), 'NOTES.md'), 'utf8')).toBe('buy milk');
    });

    it('still asks in auto_edit mode for a file that can run code', async () => {
      const id = await createConversation(alice);
      await call(alice, 'patch', `/conversations/${id}`).send({ mode: 'auto_edit' });
      await send(alice, id, 'write package.json {}');
      await waitForEvent(id, 'approval_requested');
      await call(alice, 'post', `/conversations/${id}/abort`);
      await waitForState(id, 'aborted');
    });

    it('always asks before running a command, even in auto_edit mode, and runs it after approval', async () => {
      const id = await createConversation(alice);
      await call(alice, 'patch', `/conversations/${id}`).send({ mode: 'auto_edit' });
      await send(alice, id, 'run echo hello-from-shell');
      const requested = await waitForEvent(id, 'approval_requested');
      expect(requested.payload).toMatchObject({
        name: 'run_command',
        preview: expect.stringContaining('$ echo hello'),
      });
      await call(alice, 'post', `/conversations/${id}/approvals`).send({
        callId: String(requested.payload.callId),
        approved: true,
      });
      await waitForState(id, 'finished');
      const result = (await events(id)).find((event) => event.type === 'tool_result');
      expect(result?.payload).toMatchObject({ isError: false, output: expect.stringContaining('hello-from-shell') });
    });

    it('refuses changes in plan mode', async () => {
      const id = await createConversation(alice);
      await call(alice, 'patch', `/conversations/${id}`).send({ mode: 'plan' });
      await send(alice, id, 'write NOTES.md nope');
      await waitForState(id, 'finished');
      const result = (await events(id)).find((event) => event.type === 'tool_result');
      expect(result?.payload).toMatchObject({ isError: true, output: expect.stringMatching(/not allowed/i) });
      await expect(readFile(path.join(await workspaceOf(id), 'NOTES.md'), 'utf8')).rejects.toThrow();
    });

    it('answers an approval for an unknown call with 404', async () => {
      const id = await createConversation(alice);
      const answer = await call(alice, 'post', `/conversations/${id}/approvals`).send({
        callId: 'nope',
        approved: true,
      });
      expect(answer.status).toBe(404);
    });

    it('stops a run on request and keeps the conversation usable', async () => {
      const id = await createConversation(alice);
      await send(alice, id, 'slow');
      await waitForEvent(id, 'run_started');
      expect((await call(alice, 'post', `/conversations/${id}/abort`)).status).toBe(204);
      await waitForState(id, 'aborted');
      expect((await events(id)).map((event) => event.type)).toContain('run_aborted');

      await send(alice, id, 'hello again');
      await until(async () => (await events(id)).some((e) => e.type === 'run_finished'), 'second run');
    });

    it('allows only one active run per user', async () => {
      const first = await createConversation(alice);
      const second = await createConversation(alice);
      await send(alice, first, 'slow');
      await waitForEvent(first, 'run_started');
      const refused = await send(alice, second, 'hello');
      expect(refused.status).toBe(409);
      expect((await send(bob, await createConversation(bob), 'hello')).status).toBe(202);
      await call(alice, 'post', `/conversations/${first}/abort`);
      await waitForState(first, 'aborted');
    });

    it('does not let another user send into or stop a conversation', async () => {
      const id = await createConversation(alice);
      expect((await send(bob, id, 'hi')).status).toBe(404);
      expect((await call(bob, 'post', `/conversations/${id}/abort`)).status).toBe(404);
      expect((await call(bob, 'get', `/conversations/${id}/events`)).status).toBe(404);
    });

    it('validates the message', async () => {
      const id = await createConversation(alice);
      expect((await send(alice, id, '')).status).toBe(400);
      expect((await send(alice, id, 'x'.repeat(20_001))).status).toBe(400);
    });

    it('aborts an active run when its conversation is deleted', async () => {
      const id = await createConversation(alice);
      await send(alice, id, 'slow');
      await waitForEvent(id, 'run_started');
      expect((await call(alice, 'delete', `/conversations/${id}`)).status).toBe(204);
      const next = await createConversation(alice);
      expect((await send(alice, next, 'hello')).status).toBe(202);
    });
  });

  describe('restart', () => {
    it('marks runs left running or waiting as aborted and tells clients', async () => {
      const id = await createConversation(alice);
      const [{ id: userId }] = await dataSource.query('SELECT id FROM users WHERE email = $1', ['alice@example.com']);
      expect(userId).toBeTruthy();
      await dataSource.query(`INSERT INTO runs (conversation_id, state) VALUES ($1, 'running')`, [id]);
      await app.get(RunsService).abortLeftoverRuns();
      expect(await runState(id)).toBe('aborted');
      const [run] = await dataSource.query('SELECT end_reason FROM runs WHERE conversation_id = $1', [id]);
      expect(run.end_reason).toBe('restart');
      expect((await events(id)).map((event) => event.type)).toEqual(['run_aborted']);
      expect((await send(alice, id, 'hello')).status).toBe(202);
    });

    it('repairs a history that ends in an unanswered tool call before the next run', async () => {
      const id = await createConversation(alice);
      await dataSource.query(`INSERT INTO messages (conversation_id, role, parts) VALUES ($1, 'user', $2)`, [
        id,
        JSON.stringify([{ text: 'write x x' }]),
      ]);
      await dataSource.query(`INSERT INTO messages (conversation_id, role, parts) VALUES ($1, 'model', $2)`, [
        id,
        JSON.stringify([{ functionCall: { name: 'write_file', args: { path: 'x', content: 'x' }, id: 'old' } }]),
      ]);
      await send(alice, id, 'hello');
      await waitForState(id, 'finished');
      const rows = await dataSource.query('SELECT role, parts FROM messages WHERE conversation_id = $1 ORDER BY id', [
        id,
      ]);
      expect(rows.map((row: { role: string }) => row.role)).toEqual(['user', 'model', 'user', 'model']);
      expect(rows[2].parts[0].functionResponse).toMatchObject({ id: 'old', response: { error: expect.any(String) } });
      expect(rows[2].parts[1]).toEqual({ text: 'hello' });
    });
  });

  describe('event stream (SSE)', () => {
    let port: number;

    beforeAll(async () => {
      await app.listen(0, '127.0.0.1');
      port = (app.getHttpServer().address() as AddressInfo).port;
    });

    /** Reads an SSE response until `stop` is true for the text received so far. */
    function readStream(id: string, headers: Record<string, string>, stop: (text: string) => boolean) {
      return new Promise<{ status: number; type: string; text: string }>((resolve, reject) => {
        const req = http.get(
          {
            host: '127.0.0.1',
            port,
            path: `/api/conversations/${id}/events`,
            headers: { Host: 'localhost:3000', Cookie: aliceCookie, ...headers },
          },
          (res) => {
            let text = '';
            const finish = () => {
              req.destroy();
              resolve({ status: res.statusCode ?? 0, type: String(res.headers['content-type']), text });
            };
            if ((res.statusCode ?? 0) !== 200) return finish();
            res.setEncoding('utf8');
            res.on('data', (chunk: string) => {
              text += chunk;
              if (stop(text)) finish();
            });
          },
        );
        req.on('error', reject);
        setTimeout(() => reject(new Error('SSE read timed out')), 5000).unref();
      });
    }
    const ids = (text: string) => [...text.matchAll(/^id: (\d+)$/gm)].map((match) => Number(match[1]));

    it('replays stored events after Last-Event-ID', async () => {
      const id = await createConversation(alice);
      await send(alice, id, 'hello');
      await waitForState(id, 'finished');
      const stream = await readStream(id, { 'Last-Event-ID': '2' }, (text) => ids(text).length >= 2);
      expect(stream.status).toBe(200);
      expect(stream.type).toMatch(/text\/event-stream/);
      expect(ids(stream.text)).toEqual([3, 4]);
      expect(stream.text).toContain('event: assistant_message');
      const data = [...stream.text.matchAll(/^data: (.*)$/gm)].map((match) => JSON.parse(match[1]));
      expect(data[0]).toEqual({ type: 'assistant_message', text: 'You said: hello' });
    });

    it('sends everything from the start without Last-Event-ID', async () => {
      const id = await createConversation(alice);
      await send(alice, id, 'hello');
      await waitForState(id, 'finished');
      const stream = await readStream(id, {}, (text) => ids(text).length >= 4);
      expect(ids(stream.text)).toEqual([1, 2, 3, 4]);
    });

    it('delivers live events to an open stream, without gaps or duplicates', async () => {
      const id = await createConversation(alice);
      const reading = readStream(id, {}, (text) => text.includes('event: run_finished'));
      await new Promise((resolve) => setTimeout(resolve, 100));
      await send(alice, id, 'hello');
      const stream = await reading;
      expect(ids(stream.text)).toEqual([1, 2, 3, 4]);
    });

    it('refuses a stream for a conversation of someone else', async () => {
      const id = await createConversation(bob);
      const stream = await readStream(id, {}, () => false);
      expect(stream.status).toBe(404);
    });
  });
});
