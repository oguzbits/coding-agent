import { Global, Module } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { PostgresDriver } from 'typeorm/driver/postgres/PostgresDriver.js';
import { MetricsController } from './metrics.controller.js';
import { Metrics } from './metrics.js';

@Global()
@Module({
  controllers: [MetricsController],
  providers: [
    {
      provide: Metrics,
      inject: [DataSource],
      useFactory: (dataSource: DataSource) => {
        const metrics = new Metrics();
        const pool = (dataSource.driver as PostgresDriver).master;
        metrics.watchPool(() => ({ total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount }));
        return metrics;
      },
    },
  ],
  exports: [Metrics],
})
export class MetricsModule {}
