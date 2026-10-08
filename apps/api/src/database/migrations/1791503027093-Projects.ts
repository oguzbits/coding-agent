import { MigrationInterface, QueryRunner } from 'typeorm';

export class Projects1791503027093 implements MigrationInterface {
  name = 'Projects1791503027093';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "projects" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "name" text NOT NULL, "origin" text NOT NULL DEFAULT 'empty', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_6271df0a7aed1d6c0691ce6ac50" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_9bef393585b9c960adbb68ef18" ON "projects"  ("user_id", "created_at") `);
    // Before projects existed, conversations had no folder to work in. There is no released data to carry over.
    await queryRunner.query(`DELETE FROM "conversations"`);
    await queryRunner.query(`ALTER TABLE "conversations" ADD "project_id" uuid NOT NULL`);
    await queryRunner.query(
      `ALTER TABLE "projects" ADD CONSTRAINT "FK_bd55b203eb9f92b0c8390380010" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversations" ADD CONSTRAINT "FK_9f16876c6b675f1f683e604b511" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "conversations" DROP CONSTRAINT "FK_9f16876c6b675f1f683e604b511"`);
    await queryRunner.query(`ALTER TABLE "projects" DROP CONSTRAINT "FK_bd55b203eb9f92b0c8390380010"`);
    await queryRunner.query(`ALTER TABLE "conversations" DROP COLUMN "project_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_9bef393585b9c960adbb68ef18"`);
    await queryRunner.query(`DROP TABLE "projects"`);
  }
}
