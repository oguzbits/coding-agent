import { Body, Controller, Get, Module, Post, type INestApplication } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { IsString, MinLength } from 'class-validator';
import request from 'supertest';
import { configureApp } from './app.setup.js';
import { validateEnv } from './config/env.validation.js';

class EchoDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  text!: string;
}

@Controller('ping')
class PingController {
  @Get()
  ping() {
    return { pong: true };
  }

  @Post()
  echo(@Body() dto: EchoDto) {
    return dto;
  }
}

@Module({ controllers: [PingController] })
class TestModule {}

describe('configureApp', () => {
  let app: INestApplication;
  const env = validateEnv({ DATABASE_URL: 'postgres://u:p@localhost:5432/db', PORT: '3000', LOG_LEVEL: 'error' });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [TestModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app, env);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it('serves routes below /api with security headers and a request id', async () => {
    const response = await http().get('/api/ping').set('Host', 'localhost:3000');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ pong: true });
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-request-id']).toBeTruthy();
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('rejects an unknown host', async () => {
    const response = await http().get('/api/ping').set('Host', 'evil.example');
    expect(response.status).toBe(421);
  });

  it('rejects a POST from a foreign origin', async () => {
    const response = await http()
      .post('/api/ping')
      .set('Host', 'localhost:3000')
      .set('Origin', 'https://evil.example')
      .send({ text: 'hi' });
    expect(response.status).toBe(403);
  });

  it('validates bodies and refuses properties the DTO does not declare', async () => {
    const ok = await http().post('/api/ping').set('Host', 'localhost:3000').send({ text: 'hi' });
    expect(ok.status).toBe(201);
    const extra = await http().post('/api/ping').set('Host', 'localhost:3000').send({ text: 'hi', admin: true });
    expect(extra.status).toBe(400);
    const empty = await http().post('/api/ping').set('Host', 'localhost:3000').send({ text: '' });
    expect(empty.status).toBe(400);
  });

  it('publishes the OpenAPI description derived from the DTOs', async () => {
    const response = await http().get('/api/openapi.json').set('Host', 'localhost:3000');
    expect(response.status).toBe(200);
    expect(response.body.paths['/api/ping'].post.requestBody).toBeDefined();
    expect(response.body.components.schemas.EchoDto.properties.text).toBeDefined();
  });
});
