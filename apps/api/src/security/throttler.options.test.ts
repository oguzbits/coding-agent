import { Controller, Get, Module, Post, type INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { createThrottlerOptions } from './throttler.options.js';

@Controller()
class DummyController {
  @Post('auth/login')
  login() {
    return { ok: true };
  }

  @Post('auth/register')
  register() {
    return { ok: true };
  }

  @Post('auth/forgot-password')
  forgot() {
    return { ok: true };
  }

  @Get('other')
  other() {
    return { ok: true };
  }
}

@Module({
  imports: [ThrottlerModule.forRoot(createThrottlerOptions({ defaultPerMinute: 5, authPerMinute: 2 }))],
  controllers: [DummyController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
class DummyModule {}

describe('throttler options', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [DummyModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    await app.init();
  });
  afterEach(async () => {
    await app.close();
  });

  it('limits login attempts to the auth limit, independent of the general limit', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 4; i += 1) statuses.push((await request(app.getHttpServer()).post('/api/auth/login')).status);
    expect(statuses).toEqual([201, 201, 429, 429]);
  });

  it('counts login and register together against the auth limit', async () => {
    await request(app.getHttpServer()).post('/api/auth/login');
    await request(app.getHttpServer()).post('/api/auth/register');
    expect((await request(app.getHttpServer()).post('/api/auth/login')).status).toBe(429);
  });

  it('also counts the mail and token routes against the auth limit', async () => {
    await request(app.getHttpServer()).post('/api/auth/forgot-password');
    await request(app.getHttpServer()).post('/api/auth/forgot-password');
    expect((await request(app.getHttpServer()).post('/api/auth/forgot-password')).status).toBe(429);
    expect((await request(app.getHttpServer()).post('/api/auth/login')).status).toBe(429);
  });

  it('applies the general limit to everything else and keeps it separate from the auth limit', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) statuses.push((await request(app.getHttpServer()).get('/api/other')).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
    expect((await request(app.getHttpServer()).post('/api/auth/login')).status).toBe(201);
  });
});
