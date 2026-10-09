import { Controller, Get } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService, HealthIndicatorService, type HealthIndicatorResult } from '@nestjs/terminus';
import { DataSource } from 'typeorm';
import { Public } from '../auth/public.decorator.js';

/** Liveness says the process runs; readiness says it can serve requests. For the orchestrator, not for people. */
@ApiExcludeController()
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly indicators: HealthIndicatorService,
    private readonly dataSource: DataSource,
  ) {}

  @Get('live')
  @HealthCheck()
  live() {
    return this.health.check([]);
  }

  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([() => this.database()]);
  }

  // Only up or down is reported; the error text could name hosts or users and this route has no login.
  private async database(): Promise<HealthIndicatorResult> {
    const indicator = this.indicators.check('database');
    try {
      await this.dataSource.query('SELECT 1');
      return indicator.up();
    } catch {
      return indicator.down();
    }
  }
}
