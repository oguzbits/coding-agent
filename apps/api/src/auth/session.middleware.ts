import connectPgSimple from 'connect-pg-simple';
import session from 'express-session';
import type { Pool } from 'pg';
import type { Env } from '../config/env.validation.js';

export const SESSION_COOKIE_NAME = 'coding_agent.sid';

const PgStore = connectPgSimple(session);

/** Server-side logins in Postgres. The table comes from a migration, so the store never creates it. */
export function createSessionStore(pool: Pool) {
  return new PgStore({ pool, tableName: 'auth_sessions', createTableIfMissing: false });
}

type SessionEnv = Pick<Env, 'SESSION_SECRET' | 'SESSION_IDLE_MINUTES' | 'COOKIE_SECURE' | 'NODE_ENV'>;

export function createSessionMiddleware(env: SessionEnv, store: session.Store) {
  return session({
    name: SESSION_COOKIE_NAME,
    secret: env.SESSION_SECRET,
    store,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'strict',
      secure: env.COOKIE_SECURE ?? env.NODE_ENV === 'production',
      maxAge: env.SESSION_IDLE_MINUTES * 60_000,
    },
  });
}
