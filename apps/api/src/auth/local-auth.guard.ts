import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Checks the credentials with the local strategy, then logs the user in: new session id, user id stored in it. */
@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {
  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const allowed = (await super.canActivate(context)) as boolean;
    await super.logIn(context.switchToHttp().getRequest());
    return allowed;
  }
}
