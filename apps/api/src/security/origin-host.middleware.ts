import type { NextFunction, Request, Response } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

interface Options {
  allowedOrigins: string[];
  port: number;
}

/**
 * Host check against DNS rebinding (421) and Origin check for state-changing requests against CSRF (403).
 * Requests without an Origin header come from non-browser clients and carry no ambient cookies, so they pass.
 */
export function createOriginHostMiddleware({ allowedOrigins, port }: Options) {
  const origins = new Set(allowedOrigins);
  const hosts = new Set([
    ...allowedOrigins.map((origin) => new URL(origin).host),
    `localhost:${port}`,
    `127.0.0.1:${port}`,
    `[::1]:${port}`,
  ]);

  return (req: Request, res: Response, next: NextFunction) => {
    const host = req.headers.host;
    if (!host || !hosts.has(host)) {
      res.status(421).json({ statusCode: 421, message: 'Unknown host' });
      return;
    }
    const origin = req.headers.origin;
    if (!SAFE_METHODS.has(req.method) && origin !== undefined && !origins.has(origin)) {
      res.status(403).json({ statusCode: 403, message: 'Origin not allowed' });
      return;
    }
    next();
  };
}
