import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Table of connect-pg-simple (createTableIfMissing stays off), plus an index to find the logins of one user. */
export class AuthSessions1791501450018 implements MigrationInterface {
  name = 'AuthSessions1791501450018';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "auth_sessions" ("sid" character varying NOT NULL, "sess" json NOT NULL, "expire" timestamp(6) NOT NULL, CONSTRAINT "PK_auth_sessions_sid" PRIMARY KEY ("sid"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_auth_sessions_expire" ON "auth_sessions" ("expire")`);
    await queryRunner.query(
      `CREATE INDEX "IDX_auth_sessions_user" ON "auth_sessions" (((sess -> 'passport') ->> 'user'))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "auth_sessions"`);
  }
}
