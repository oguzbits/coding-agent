import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../../app.module.js';
import { configureApp } from '../../app.setup.js';
import { validateEnv } from '../../config/env.validation.js';
import { resetTestDatabase } from '../../testing/test-database.js';
import { pacificDay } from '../rate-limit/rate-limiter.js';
import { TypeOrmCallLog, TypeOrmUsageStore } from './usage.stores.js';

describe('usage tracking', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let userId: string;
  let agent: ReturnType<typeof request.agent>;

  const call = (method: 'get' | 'put', url: string) => agent[method](`/api${url}`).set('Host', 'localhost:3000');

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
    agent = request.agent(app.getHttpServer());
    await call('get', '/auth/me'); // no session yet
    const credentials = { email: 'alice@example.com', password: 'correct horse battery staple' };
    await agent.post('/api/auth/register').set('Host', 'localhost:3000').send(credentials);
    const login = await agent.post('/api/auth/login').set('Host', 'localhost:3000').send(credentials);
    userId = login.body.id;
  });

  it('counts requests and tokens per user, model and day', async () => {
    const store = new TypeOrmUsageStore(dataSource);
    expect(await store.requestsToday(userId, 'm1', '2026-10-09')).toBe(0);
    await store.add(userId, 'm1', '2026-10-09', 100);
    await store.add(userId, 'm1', '2026-10-09', 50);
    await store.add(userId, 'm2', '2026-10-09', 7);
    await store.add(userId, 'm1', '2026-10-10', 1);
    expect(await store.requestsToday(userId, 'm1', '2026-10-09')).toBe(2);
    expect(await store.requestsToday(userId, 'm2', '2026-10-09')).toBe(1);
    const [row] = await dataSource.query('SELECT tokens FROM usage_daily WHERE model = $1 AND day = $2', [
      'm1',
      '2026-10-09',
    ]);
    expect(Number(row.tokens)).toBe(150);
  });

  it('counts concurrent additions without losing any', async () => {
    const store = new TypeOrmUsageStore(dataSource);
    await Promise.all(Array.from({ length: 10 }, () => store.add(userId, 'm1', '2026-10-09', 1)));
    expect(await store.requestsToday(userId, 'm1', '2026-10-09')).toBe(10);
  });

  it('logs model calls without content and keeps them when the run is gone', async () => {
    const log = new TypeOrmCallLog(dataSource);
    await log.record({
      userId,
      runId: null,
      model: 'm1',
      promptTokens: 10,
      outputTokens: 2,
      durationMs: 55,
      errorCode: 'auth',
    });
    const rows = await dataSource.query('SELECT * FROM model_calls');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      model: 'm1',
      prompt_tokens: 10,
      output_tokens: 2,
      duration_ms: 55,
      error_code: 'auth',
    });
    expect(Object.keys(rows[0]).sort()).toEqual(
      [
        'created_at',
        'duration_ms',
        'error_code',
        'id',
        'model',
        'output_tokens',
        'prompt_tokens',
        'run_id',
        'user_id',
      ].sort(),
    );
  });

  it('shows the user what was spent today against the effective limits', async () => {
    const empty = await call('get', '/usage');
    expect(empty.status).toBe(200);
    expect(empty.body).toMatchObject({
      day: pacificDay(Date.now()),
      requests: 0,
      tokens: 0,
      limits: { requestsPerMinute: 15, tokensPerMinute: 250_000, requestsPerDay: 500 },
    });
    expect(empty.body.model).toMatch(/^gemini-/);

    await call('put', '/users/me/model').send({ modelName: 'custom-model', requestsPerDay: 20 });
    await new TypeOrmUsageStore(dataSource).add(userId, 'custom-model', pacificDay(Date.now()), 321);
    const after = await call('get', '/usage');
    expect(after.body).toMatchObject({
      model: 'custom-model',
      requests: 1,
      tokens: 321,
      limits: { requestsPerDay: 20 },
    });
  });

  it('requires login', async () => {
    const anonymous = await request(app.getHttpServer()).get('/api/usage').set('Host', 'localhost:3000');
    expect(anonymous.status).toBe(401);
  });
});
