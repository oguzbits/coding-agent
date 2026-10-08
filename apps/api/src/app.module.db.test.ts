import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { validateEnv } from './config/env.validation.js';

describe('AppModule', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app, validateEnv(process.env));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('connects to the database named in DATABASE_URL', async () => {
    const dataSource = app.get(DataSource);
    const [row] = await dataSource.query('select current_database() as name');
    expect(row.name).toMatch(/_test$/);
  });

  it('keeps synchronize off', () => {
    expect(app.get(DataSource).options.synchronize).toBe(false);
  });

  it('serves the OpenAPI description', async () => {
    const response = await request(app.getHttpServer()).get('/api/openapi.json').set('Host', 'localhost:3000');
    expect(response.status).toBe(200);
  });
});
