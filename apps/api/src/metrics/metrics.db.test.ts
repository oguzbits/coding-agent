import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../app.module.js';
import { configureApp } from '../app.setup.js';
import { validateEnv } from '../config/env.validation.js';
import { resetTestDatabase } from '../testing/test-database.js';

// The config module reads the environment when AppModule is imported, so this must run before the imports below.
vi.hoisted(() => {
  process.env.METRICS_TOKEN = 'a-long-enough-secret-token';
});

describe('metrics endpoint and instrumentation (HTTP, fake model)', () => {
  let app: INestApplication;
  const scrape = () =>
    request(app.getHttpServer())
      .get('/metrics')
      .set('Host', 'localhost:3000')
      .set('Authorization', 'Bearer a-long-enough-secret-token');
  const valueOf = (text: string, series: string) =>
    Number(
      text
        .split('\n')
        .find((line) => line.startsWith(`${series} `))
        ?.slice(series.length + 1),
    );

  beforeAll(async () => {
    await resetTestDatabase();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app, validateEnv(process.env));
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });

  it('is outside the /api prefix and needs the token', async () => {
    const anonymous = await request(app.getHttpServer()).get('/metrics').set('Host', 'localhost:3000');
    expect(anonymous.status).toBe(401);
    const response = await scrape();
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.text).toContain('db_pool_connections{state="total"}');
  });

  it('counts a finished run and the model call behind it', async () => {
    const agent = request.agent(app.getHttpServer());
    const call = (method: 'post' | 'get', url: string, body?: object) =>
      agent[method](`/api${url}`).set('Host', 'localhost:3000').send(body);
    const credentials = { email: 'metrics@example.com', password: 'correct horse battery staple' };
    await call('post', '/auth/register', credentials);
    await call('post', '/auth/login', credentials);
    const project = await call('post', '/projects', { name: 'M' });
    const conversation = await call('post', '/conversations', { projectId: project.body.id });
    await call('post', `/conversations/${conversation.body.id}/messages`, { text: 'hello' });
    await vi.waitFor(async () => {
      const text = (await scrape()).text;
      expect(valueOf(text, 'agent_run_duration_seconds_count{state="finished"}')).toBeGreaterThanOrEqual(1);
    });
    expect(valueOf((await scrape()).text, 'agent_active_runs')).toBe(0);
  });
});
