import { Injectable } from '@nestjs/common';
import { PassportSerializer } from '@nestjs/passport';
import { UsersService } from '../users/users.service.js';

/** The login stores only the user id; every request loads the user again, so a deleted user is logged out at once. */
@Injectable()
export class SessionSerializer extends PassportSerializer {
  constructor(private readonly users: UsersService) {
    super();
  }

  serializeUser(user: Express.User, done: (error: Error | null, id?: string) => void) {
    done(null, user.id);
  }

  async deserializeUser(id: string, done: (error: Error | null, user?: Express.User | false) => void) {
    const user = await this.users.findById(id);
    done(null, user ? { id: user.id, email: user.email, emailConfirmed: user.emailVerifiedAt !== null } : false);
  }
}
