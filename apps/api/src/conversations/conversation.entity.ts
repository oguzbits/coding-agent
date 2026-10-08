import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity.js';

@Entity('conversations')
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ type: 'text' })
  title!: string;

  /** Permission mode; the policy service (slice 6a) decides what each mode allows. */
  @Column({ type: 'text', default: 'ask' })
  mode!: string;

  /** Last number handed out to a run event of this conversation. */
  @Column({ name: 'last_event_seq', type: 'int', default: 0 })
  lastEventSeq!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
