import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { Env } from '../config/env.validation.js';

/** For routes that cost something (starting a run): unconfirmed accounts are turned away while confirmation is required. */
@Injectable()
export class EmailConfirmedGuard implements CanActivate {
  private readonly required: boolean;

  constructor(config: ConfigService<Env, true>) {
    this.required = config.get('REQUIRE_EMAIL_CONFIRMATION', { infer: true });
  }

  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<Request>().user;
    if (this.required && !user?.emailConfirmed) {
      throw new ForbiddenException('Confirm your email address first. You can ask for a new link in the settings.');
    }
    return true;
  }
}
