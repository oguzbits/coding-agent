import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { ProviderPart } from '../model/model-provider.js';
import { Conversation } from './conversation.entity.js';

/** One entry of the model history. The parts are stored exactly as the provider returned them. */
@Entity('messages')
@Index(['conversationId', 'id'])
export class Message {
  @PrimaryGeneratedColumn('identity', { type: 'bigint', generatedIdentity: 'ALWAYS' })
  id!: string;

  @Column({ name: 'conversation_id', type: 'uuid' })
  conversationId!: string;

  @ManyToOne(() => Conversation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation?: Conversation;

  @Column({ type: 'text' })
  role!: 'user' | 'model';

  @Column({ type: 'jsonb' })
  parts!: ProviderPart[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
