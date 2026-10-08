import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { requestContext } from './request-context.js';

const SANE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Gives each request an id (taken from X-Request-Id when it looks sane) and keeps it for everything the request does. */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const sent = req.header('x-request-id');
  const requestId = sent && SANE_ID.test(sent) ? sent : randomUUID();
  res.setHeader('X-Request-Id', requestId);
  requestContext.run({ requestId }, next);
}
