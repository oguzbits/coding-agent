import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { User } from './user.entity.js';

@Entity('user_settings')
export class UserSettings {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ name: 'gemini_key_ciphertext', type: 'bytea', nullable: true })
  geminiKeyCiphertext!: Buffer | null;

  @Column({ name: 'gemini_key_iv', type: 'bytea', nullable: true })
  geminiKeyIv!: Buffer | null;

  @Column({ name: 'gemini_key_tag', type: 'bytea', nullable: true })
  geminiKeyTag!: Buffer | null;

  @Column({ name: 'gemini_key_version', type: 'int', nullable: true })
  geminiKeyVersion!: number | null;

  @Column({ name: 'gemini_key_last4', type: 'varchar', length: 4, nullable: true })
  geminiKeyLast4!: string | null;

  @Column({ name: 'model_name', type: 'text', nullable: true })
  modelName!: string | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
