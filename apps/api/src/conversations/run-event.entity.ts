import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import type { RunEvent as RunEventPayload } from '../agent/types.js';
import { Conversation } from './conversation.entity.js';
import { Run } from './run.entity.js';

/** Stored before it is sent, so a reconnecting client can ask for everything after a number. */
@Entity('run_events')
export class RunEventRecord {
  @PrimaryColumn({ name: 'conversation_id', type: 'uuid' })
  conversationId!: string;

  @PrimaryColumn({ type: 'int' })
  seq!: number;

  @ManyToOne(() => Conversation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation?: Conversation;

  @Column({ name: 'run_id', type: 'uuid' })
  runId!: string;

  @ManyToOne(() => Run, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'run_id' })
  run?: Run;

  @Column({ type: 'text' })
  type!: RunEventPayload['type'];

  @Column({ type: 'jsonb' })
  payload!: RunEventPayload;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
