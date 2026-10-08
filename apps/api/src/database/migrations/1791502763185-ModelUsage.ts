import { MigrationInterface, QueryRunner } from 'typeorm';

export class ModelUsage1791502763185 implements MigrationInterface {
  name = 'ModelUsage1791502763185';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "model_calls" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "run_id" uuid, "model" text NOT NULL, "prompt_tokens" integer NOT NULL, "output_tokens" integer NOT NULL, "duration_ms" integer NOT NULL, "error_code" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_e2538384974b0960151a53380c1" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ace403bcc0988fd4436adfdab8" ON "model_calls"  ("user_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "usage_daily" ("user_id" uuid NOT NULL, "model" text NOT NULL, "day" date NOT NULL, "requests" integer NOT NULL DEFAULT '0', "tokens" bigint NOT NULL DEFAULT '0', CONSTRAINT "PK_0a401d4f2a5ff635fc25b0b6fe5" PRIMARY KEY ("user_id", "model", "day"))`,
    );
    await queryRunner.query(`ALTER TABLE "user_settings" ADD "requests_per_minute" integer`);
    await queryRunner.query(`ALTER TABLE "user_settings" ADD "tokens_per_minute" integer`);
    await queryRunner.query(`ALTER TABLE "user_settings" ADD "requests_per_day" integer`);
    await queryRunner.query(
      `ALTER TABLE "model_calls" ADD CONSTRAINT "FK_0e6860dfd76d71a19f6494a2ddb" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "model_calls" ADD CONSTRAINT "FK_a2b2f1aad044d1944ed3ee506a4" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "usage_daily" ADD CONSTRAINT "FK_203b27e5e3fbbe9bbf427ccea26" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "usage_daily" DROP CONSTRAINT "FK_203b27e5e3fbbe9bbf427ccea26"`);
    await queryRunner.query(`ALTER TABLE "model_calls" DROP CONSTRAINT "FK_a2b2f1aad044d1944ed3ee506a4"`);
    await queryRunner.query(`ALTER TABLE "model_calls" DROP CONSTRAINT "FK_0e6860dfd76d71a19f6494a2ddb"`);
    await queryRunner.query(`ALTER TABLE "user_settings" DROP COLUMN "requests_per_day"`);
    await queryRunner.query(`ALTER TABLE "user_settings" DROP COLUMN "tokens_per_minute"`);
    await queryRunner.query(`ALTER TABLE "user_settings" DROP COLUMN "requests_per_minute"`);
    await queryRunner.query(`DROP TABLE "usage_daily"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ace403bcc0988fd4436adfdab8"`);
    await queryRunner.query(`DROP TABLE "model_calls"`);
  }
}
