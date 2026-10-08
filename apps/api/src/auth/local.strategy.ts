import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { UsersService } from '../users/users.service.js';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly users: UsersService) {
    super({ usernameField: 'email' });
  }

  async validate(email: string, password: string): Promise<Express.User> {
    const user = await this.users.authenticate(email, password);
    if (!user) throw new UnauthorizedException('Invalid email or password');
    return { id: user.id, email: user.email };
  }
}
