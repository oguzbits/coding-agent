import type { NextFunction, Request, Response } from 'express';
import { requestIdMiddleware } from './request-id.middleware.js';
import { requestContext } from './request-context.js';

function run(headerValue?: string) {
  const req = {
    header: (name: string) => (name.toLowerCase() === 'x-request-id' ? headerValue : undefined),
  } as Request;
  const headers: Record<string, string> = {};
  const res = { setHeader: (name: string, value: string) => (headers[name] = value) } as unknown as Response;
  let seen: string | undefined;
  const next: NextFunction = () => {
    seen = requestContext.getStore()?.requestId;
  };
  requestIdMiddleware(req, res, next);
  return { headers, seen };
}

describe('requestIdMiddleware', () => {
  it('generates an id, exposes it in the context and returns it as a header', () => {
    const { headers, seen } = run();
    expect(seen).toMatch(/^[0-9a-f-]{36}$/);
    expect(headers['X-Request-Id']).toBe(seen);
  });

  it('keeps a sane id sent by the client', () => {
    expect(run('abc-123_DEF').seen).toBe('abc-123_DEF');
  });

  it('replaces ids with odd characters or excessive length', () => {
    expect(run('bad id\nwith newline').seen).toMatch(/^[0-9a-f-]{36}$/);
    expect(run('x'.repeat(200)).seen).toMatch(/^[0-9a-f-]{36}$/);
  });
});
