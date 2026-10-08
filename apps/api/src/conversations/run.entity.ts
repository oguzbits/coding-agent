import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { RunState } from '../agent/types.js';
import { Conversation } from './conversation.entity.js';

@Entity('runs')
@Index(['conversationId', 'startedAt'])
export class Run {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'conversation_id', type: 'uuid' })
  conversationId!: string;

  @ManyToOne(() => Conversation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation?: Conversation;

  @Column({ type: 'text' })
  state!: RunState;

  /** The tool call waiting for the user's decision, if any. */
  @Column({ name: 'pending_approval', type: 'jsonb', nullable: true })
  pendingApproval!: { callId: string; name: string; preview: string } | null;

  @Column({ name: 'started_at', type: 'timestamptz', default: () => 'now()' })
  startedAt!: Date;

  @Column({ name: 'ended_at', type: 'timestamptz', nullable: true })
  endedAt!: Date | null;

  /** `finished`, `aborted`, `restart`, or a failure code. */
  @Column({ name: 'end_reason', type: 'text', nullable: true })
  endReason!: string | null;
}
