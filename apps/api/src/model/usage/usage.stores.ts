import type { DataSource } from 'typeorm';
import type { CallRecord, UsageStore } from '../rate-limit/rate-limiter.js';
import { ModelCall } from './model-call.entity.js';
import { UsageDaily } from './usage-daily.entity.js';

export class TypeOrmUsageStore implements UsageStore {
  constructor(private readonly dataSource: DataSource) {}

  async today(userId: string, model: string, day: string): Promise<{ requests: number; tokens: number }> {
    const row = await this.dataSource.getRepository(UsageDaily).findOneBy({ userId, model, day });
    return { requests: row?.requests ?? 0, tokens: row?.tokens ?? 0 };
  }

  async requestsToday(userId: string, model: string, day: string): Promise<number> {
    return (await this.today(userId, model, day)).requests;
  }

  /** One atomic statement, so parallel additions cannot lose each other. */
  async add(userId: string, model: string, day: string, tokens: number): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO usage_daily (user_id, model, day, requests, tokens) VALUES ($1, $2, $3, 1, $4)
       ON CONFLICT (user_id, model, day)
       DO UPDATE SET requests = usage_daily.requests + 1, tokens = usage_daily.tokens + EXCLUDED.tokens`,
      [userId, model, day, tokens],
    );
  }
}

export class TypeOrmCallLog {
  constructor(private readonly dataSource: DataSource) {}

  async record(record: CallRecord): Promise<void> {
    await this.dataSource.getRepository(ModelCall).save(Object.assign(new ModelCall(), record));
  }
}
