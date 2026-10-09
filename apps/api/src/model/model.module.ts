import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import type { Env } from '../config/env.validation.js';
import { Metrics } from '../metrics/metrics.js';
import { UsersModule } from '../users/users.module.js';
import { UsersService } from '../users/users.service.js';
import { DemoProvider } from './fake/demo-provider.js';
import { GeminiProvider } from './gemini/gemini-provider.js';
import { ModelGateway } from './model.gateway.js';
import { RateLimiter, defaultRateLimiterDeps } from './rate-limit/rate-limiter.js';
import { UsageController } from './usage/usage.controller.js';
import { TypeOrmCallLog, TypeOrmUsageStore } from './usage/usage.stores.js';

@Module({
  imports: [UsersModule],
  controllers: [UsageController],
  providers: [
    {
      provide: TypeOrmUsageStore,
      inject: [DataSource],
      useFactory: (dataSource: DataSource) => new TypeOrmUsageStore(dataSource),
    },
    {
      provide: TypeOrmCallLog,
      inject: [DataSource],
      useFactory: (dataSource: DataSource) => new TypeOrmCallLog(dataSource),
    },
    {
      provide: RateLimiter,
      inject: [TypeOrmUsageStore, TypeOrmCallLog, Metrics],
      useFactory: (usage: TypeOrmUsageStore, log: TypeOrmCallLog, metrics: Metrics) =>
        new RateLimiter({
          ...defaultRateLimiterDeps,
          usage,
          log: {
            record: async (record) => {
              metrics.modelCall(record);
              await log.record(record);
            },
          },
          sleep: async (ms, signal) => {
            const started = Date.now();
            try {
              await defaultRateLimiterDeps.sleep(ms, signal);
            } finally {
              metrics.limiterWaited((Date.now() - started) / 1000);
            }
          },
        }),
    },
    {
      provide: ModelGateway,
      inject: [ConfigService, UsersService, RateLimiter],
      useFactory: (config: ConfigService<Env, true>, users: UsersService, limiter: RateLimiter) =>
        new ModelGateway(
          config.get('MODEL_PROVIDER', { infer: true }),
          {
            model: config.get('GEMINI_DEFAULT_MODEL', { infer: true }),
            limits: {
              requestsPerMinute: config.get('GEMINI_DEFAULT_REQUESTS_PER_MINUTE', { infer: true }),
              tokensPerMinute: config.get('GEMINI_DEFAULT_TOKENS_PER_MINUTE', { infer: true }),
              requestsPerDay: config.get('GEMINI_DEFAULT_REQUESTS_PER_DAY', { infer: true }),
            },
          },
          users,
          limiter,
          new GeminiProvider(),
          new DemoProvider(config.get('FAKE_MODEL_DELAY_MS', { infer: true })),
        ),
    },
  ],
  exports: [ModelGateway],
})
export class ModelModule {}
