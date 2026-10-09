import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module.js';
import { configureApp } from '../app.setup.js';
import { validateEnv } from '../config/env.validation.js';
import { resetTestDatabase } from '../testing/test-database.js';

describe('health checks (HTTP)', () => {
  let app: INestApplication;
  const get = (url: string) => request(app.getHttpServer()).get(`/api${url}`).set('Host', 'localhost:3000');

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
  afterEach(() => vi.restoreAllMocks());

  it('answers liveness without a login and without touching the database', async () => {
    const querySpy = vi.spyOn(app.get(DataSource), 'query');
    const response = await get('/health/live');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(querySpy).not.toHaveBeenCalled();
  });

  it('is ready when the database answers', async () => {
    const response = await get('/health/ready');
    expect(response.status).toBe(200);
    expect(response.body.info).toHaveProperty('database');
  });

  it('is not ready when the database does not answer, and says only that, not why', async () => {
    vi.spyOn(app.get(DataSource), 'query').mockRejectedValue(new Error('connection to secret-host refused'));
    const response = await get('/health/ready');
    expect(response.status).toBe(503);
    expect(response.body.error).toHaveProperty('database');
    expect(JSON.stringify(response.body)).not.toContain('secret-host');
  });
});
