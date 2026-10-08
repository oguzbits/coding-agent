import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { createHash } from 'node:crypto';
import type { Request } from 'express';
import type { Env } from '../config/env.validation.js';
import { requestContext } from '../logging/request-context.js';
import { IS_PUBLIC } from './public.decorator.js';

/** Global guard: every route needs a login unless it is marked @Public(). Enforces the fixed maximum lifetime. */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  private readonly maxAgeMs: number;

  constructor(
    private readonly reflector: Reflector,
    config: ConfigService<Env, true>,
  ) {
    this.maxAgeMs = config.get('SESSION_MAX_HOURS', { infer: true }) * 3_600_000;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()])) return true;

    const request = context.switchToHttp().getRequest<Request>();
    if (!request.isAuthenticated() || !request.user) throw new UnauthorizedException();

    const createdAt = request.session.createdAt;
    if (createdAt === undefined || Date.now() - createdAt > this.maxAgeMs) {
      await new Promise<void>((resolve) => request.session.destroy(() => resolve()));
      throw new UnauthorizedException();
    }

    const store = requestContext.getStore();
    if (store) {
      store.userId = request.user.id;
      // Only a fingerprint: the session id itself is a credential and must not reach the logs.
      store.authSessionId = createHash('sha256').update(request.sessionID).digest('hex').slice(0, 12);
    }
    return true;
  }
}
