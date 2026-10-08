import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { User } from '../../users/user.entity.js';

const toNumber = { to: (value: number) => value, from: (value: string) => Number(value) };

/** What one user has spent on one model on one day (Pacific Time, as Google counts it). */
@Entity('usage_daily')
export class UsageDaily {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @PrimaryColumn({ type: 'text' })
  model!: string;

  @PrimaryColumn({ type: 'date' })
  day!: string;

  @Column({ type: 'int', default: 0 })
  requests!: number;

  @Column({ type: 'bigint', default: 0, transformer: toNumber })
  tokens!: number;
}
