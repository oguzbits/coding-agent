import { Injectable } from '@nestjs/common';
import { ProjectsService } from '../projects/projects.service.js';
import { UsersService } from '../users/users.service.js';
import { AuthSessionsService } from './auth-sessions.service.js';

@Injectable()
export class AccountDeletionService {
  constructor(
    private readonly users: UsersService,
    private readonly projects: ProjectsService,
    private readonly authSessions: AuthSessionsService,
  ) {}

  /** Deletes the account after the password check. Runs are stopped and the files removed before the data goes. */
  async delete(userId: string, password: string): Promise<boolean> {
    if (!(await this.users.verifyPassword(userId, password))) return false;
    await this.projects.removeAll(userId);
    await this.users.delete(userId);
    await this.authSessions.endAll(userId);
    return true;
  }
}
