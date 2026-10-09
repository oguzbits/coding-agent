import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface LoginView {
  /** SHA-256 of the session id: names a login without being usable as one. */
  id: string;
  createdAt: Date | null;
  userAgent: string | null;
  current: boolean;
}

const SESSION_ID_HASH = `encode(sha256(convert_to(sid, 'UTF8')), 'hex')`;
const OF_USER = `(sess -> 'passport') ->> 'user' = $1`;

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

  async list(userId: string, currentSessionId: string): Promise<LoginView[]> {
    const rows: Array<{ id: string; sid: string; created_at: string | null; user_agent: string | null }> =
      await this.dataSource.query(
        `SELECT ${SESSION_ID_HASH} AS id, sid, sess ->> 'createdAt' AS created_at, sess ->> 'userAgent' AS user_agent
         FROM auth_sessions WHERE ${OF_USER} ORDER BY (sess ->> 'createdAt')::bigint DESC NULLS LAST`,
        [userId],
      );
    return rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at ? new Date(Number(row.created_at)) : null,
      userAgent: row.user_agent,
      current: row.sid === currentSessionId,
    }));
  }

  /** Ends one login of the user, named by the hash from the list. False if the user has no such login. */
  async endOne(userId: string, id: string): Promise<boolean> {
    const [, count] = await this.dataSource.query(
      `DELETE FROM auth_sessions WHERE ${OF_USER} AND ${SESSION_ID_HASH} = $2`,
      [userId, id],
    );
    return count > 0;
  }

  /** Ends every login of the user, for example after the password was reset. */
  async endAll(userId: string): Promise<void> {
    await this.dataSource.query(`DELETE FROM auth_sessions WHERE (sess -> 'passport') ->> 'user' = $1`, [userId]);
  }
}
