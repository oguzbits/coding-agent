import type { ExecutionContext } from '@nestjs/common';
import type { ThrottlerModuleOptions } from '@nestjs/throttler';

const AUTH_ROUTE = /\/auth\/(login|register)\/?$/;

const isAuthRoute = (context: ExecutionContext) =>
  AUTH_ROUTE.test(context.switchToHttp().getRequest<{ path: string }>().path);

interface Limits {
  defaultPerMinute: number;
  authPerMinute: number;
}

/** Two buckets per client: a strict one for login and register (guessing passwords), a generous one for the rest. */
export function createThrottlerOptions({ defaultPerMinute, authPerMinute }: Limits): ThrottlerModuleOptions {
  return {
    // One counter per client and bucket, not per route: login and register share the auth budget.
    generateKey: (_context, tracker, throttlerName) => `${throttlerName}:${tracker}`,
    throttlers: [
      { name: 'default', ttl: 60_000, limit: defaultPerMinute, skipIf: isAuthRoute },
      { name: 'auth', ttl: 60_000, limit: authPerMinute, skipIf: (context) => !isAuthRoute(context) },
    ],
  };
}
