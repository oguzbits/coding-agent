import { MigrationInterface, QueryRunner } from 'typeorm';

/** Link tokens for confirming an email and resetting a password. Accounts that exist already count as confirmed. */
export class AccountTokens1791510006673 implements MigrationInterface {
  name = 'AccountTokens1791510006673';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "account_tokens" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "purpose" text NOT NULL, "token_hash" text NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "used_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_5e3640c493cc6206a44b885e6a9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_1b5fea09efc20c7f63c4a09b3d" ON "account_tokens"  ("user_id") `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_167033390a71c52224c7c636c8" ON "account_tokens"  ("token_hash") `,
    );
    await queryRunner.query(
      `ALTER TABLE "account_tokens" ADD CONSTRAINT "FK_1b5fea09efc20c7f63c4a09b3d6" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(`UPDATE "users" SET "email_verified_at" = "created_at" WHERE "email_verified_at" IS NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "account_tokens" DROP CONSTRAINT "FK_1b5fea09efc20c7f63c4a09b3d6"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_167033390a71c52224c7c636c8"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_1b5fea09efc20c7f63c4a09b3d"`);
    await queryRunner.query(`DROP TABLE "account_tokens"`);
  }
}
