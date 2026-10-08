import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/** The logged-in user of the request. Only valid on routes behind the global session guard. */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): Express.User => {
  const user = context.switchToHttp().getRequest<Request>().user;
  if (!user) throw new Error('CurrentUser used on a route without login');
  return user;
});
