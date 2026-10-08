import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class AuthSessionsService {
  constructor(private readonly dataSource: DataSource) {}

  /** Ends every login of the user except the one with the given session id. */
  async endOthers(userId: string, keepSessionId: string): Promise<void> {
    await this.dataSource.query(`DELETE FROM auth_sessions WHERE (sess -> 'passport') ->> 'user' = $1 AND sid <> $2`, [
      userId,
      keepSessionId,
    ]);
  }
}
