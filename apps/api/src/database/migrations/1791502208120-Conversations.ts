import { MigrationInterface, QueryRunner } from 'typeorm';

export class Conversations1791502208120 implements MigrationInterface {
  name = 'Conversations1791502208120';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "conversations" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "title" text NOT NULL, "mode" text NOT NULL DEFAULT 'ask', "last_event_seq" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_ee34f4f7ced4ec8681f26bf04ef" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "messages" ("id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL, "conversation_id" uuid NOT NULL, "role" text NOT NULL, "parts" jsonb NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_18325f38ae6de43878487eff986" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_862bd5c6b6ec65b905476e2ba4" ON "messages"  ("conversation_id", "id") `);
    await queryRunner.query(
      `CREATE TABLE "runs" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "conversation_id" uuid NOT NULL, "state" text NOT NULL, "pending_approval" jsonb, "started_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "ended_at" TIMESTAMP WITH TIME ZONE, "end_reason" text, CONSTRAINT "PK_46d6a1e257c38ba58f1a3c30836" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_003109aeb2fb58655083aa857e" ON "runs"  ("conversation_id", "started_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "run_events" ("conversation_id" uuid NOT NULL, "seq" integer NOT NULL, "run_id" uuid NOT NULL, "type" text NOT NULL, "payload" jsonb NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_28b2564a38160407e9585314cca" PRIMARY KEY ("conversation_id", "seq"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversations" ADD CONSTRAINT "FK_3a9ae579e61e81cc0e989afeb4a" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "messages" ADD CONSTRAINT "FK_3bc55a7c3f9ed54b520bb5cfe23" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "runs" ADD CONSTRAINT "FK_80579dca7757ced746debfd28f7" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "run_events" ADD CONSTRAINT "FK_fa041eba4570b1ddc325ec67990" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "run_events" ADD CONSTRAINT "FK_5d8974d438d9e9eb7dd9f6856d1" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "run_events" DROP CONSTRAINT "FK_5d8974d438d9e9eb7dd9f6856d1"`);
    await queryRunner.query(`ALTER TABLE "run_events" DROP CONSTRAINT "FK_fa041eba4570b1ddc325ec67990"`);
    await queryRunner.query(`ALTER TABLE "runs" DROP CONSTRAINT "FK_80579dca7757ced746debfd28f7"`);
    await queryRunner.query(`ALTER TABLE "messages" DROP CONSTRAINT "FK_3bc55a7c3f9ed54b520bb5cfe23"`);
    await queryRunner.query(`ALTER TABLE "conversations" DROP CONSTRAINT "FK_3a9ae579e61e81cc0e989afeb4a"`);
    await queryRunner.query(`DROP TABLE "run_events"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_003109aeb2fb58655083aa857e"`);
    await queryRunner.query(`DROP TABLE "runs"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_862bd5c6b6ec65b905476e2ba4"`);
    await queryRunner.query(`DROP TABLE "messages"`);
    await queryRunner.query(`DROP TABLE "conversations"`);
  }
}
