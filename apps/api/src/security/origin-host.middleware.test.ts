import type { NextFunction, Request, Response } from 'express';
import { createOriginHostMiddleware } from './origin-host.middleware.js';

const middleware = createOriginHostMiddleware({
  allowedOrigins: ['http://localhost:5173', 'https://app.example'],
  port: 3000,
});

function run(req: { method?: string; host?: string; origin?: string }) {
  const request = {
    method: req.method ?? 'GET',
    headers: { host: req.host, origin: req.origin },
  } as unknown as Request;
  let status: number | undefined;
  let called = false;
  const response = {
    status(code: number) {
      status = code;
      return this;
    },
    json() {
      return this;
    },
  } as unknown as Response;
  const next: NextFunction = () => {
    called = true;
  };
  middleware(request, response, next);
  return { status, called };
}

describe('origin and host check', () => {
  it('lets a request for a known host through', () => {
    expect(run({ host: 'localhost:3000' }).called).toBe(true);
    expect(run({ host: '127.0.0.1:3000' }).called).toBe(true);
    expect(run({ host: 'app.example' }).called).toBe(true);
    expect(run({ host: 'localhost:5173' }).called).toBe(true);
  });

  it('rejects an unknown host with 421 (DNS rebinding)', () => {
    expect(run({ host: 'evil.example' })).toEqual({ status: 421, called: false });
    expect(run({})).toEqual({ status: 421, called: false });
  });

  it('rejects a state-changing request from a foreign origin with 403', () => {
    expect(run({ method: 'POST', host: 'localhost:3000', origin: 'https://evil.example' })).toEqual({
      status: 403,
      called: false,
    });
    expect(run({ method: 'DELETE', host: 'localhost:3000', origin: 'null' }).status).toBe(403);
  });

  it('accepts a state-changing request from an allowed origin or without origin', () => {
    expect(run({ method: 'POST', host: 'localhost:3000', origin: 'http://localhost:5173' }).called).toBe(true);
    expect(run({ method: 'POST', host: 'localhost:3000' }).called).toBe(true);
  });

  it('does not check the origin of safe methods', () => {
    expect(run({ method: 'GET', host: 'localhost:3000', origin: 'https://evil.example' }).called).toBe(true);
  });
});
