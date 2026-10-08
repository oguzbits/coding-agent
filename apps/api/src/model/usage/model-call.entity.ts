import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Run } from '../../conversations/run.entity.js';
import { User } from '../../users/user.entity.js';

/** One call to the model: numbers and an error code, no prompts, answers or keys. */
@Entity('model_calls')
@Index(['userId', 'createdAt'])
export class ModelCall {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ name: 'run_id', type: 'uuid', nullable: true })
  runId!: string | null;

  @ManyToOne(() => Run, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'run_id' })
  run?: Run;

  @Column({ type: 'text' })
  model!: string;

  @Column({ name: 'prompt_tokens', type: 'int' })
  promptTokens!: number;

  @Column({ name: 'output_tokens', type: 'int' })
  outputTokens!: number;

  @Column({ name: 'duration_ms', type: 'int' })
  durationMs!: number;

  @Column({ name: 'error_code', type: 'text', nullable: true })
  errorCode!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
