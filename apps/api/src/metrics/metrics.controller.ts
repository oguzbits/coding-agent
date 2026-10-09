import { Controller, Get, Headers, Header, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { timingSafeEqual } from 'node:crypto';
import { Public } from '../auth/public.decorator.js';
import type { Env } from '../config/env.validation.js';
import { Metrics } from './metrics.js';

const sameSecret = (given: string, expected: string): boolean => {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

/**
 * Prometheus scrape target, outside the /api prefix so a proxy that forwards /api does not publish it.
 * Off (404) unless METRICS_TOKEN is set; then it needs `Authorization: Bearer <token>`.
 */
@ApiExcludeController()
@Public()
@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly metrics: Metrics,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async scrape(@Headers('authorization') authorization: string | undefined): Promise<string> {
    const token = this.config.get('METRICS_TOKEN', { infer: true });
    if (!token) throw new NotFoundException();
    if (!authorization?.startsWith('Bearer ') || !sameSecret(authorization.slice('Bearer '.length), token)) {
      throw new UnauthorizedException();
    }
    return this.metrics.render();
  }
}
