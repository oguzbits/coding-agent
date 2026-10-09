import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

export interface PoolStats {
  total: number;
  idle: number;
  waiting: number;
}

export interface RunEnd {
  state: 'finished' | 'aborted' | 'failed';
  seconds: number;
  /** Only runs that finished normally report their steps. */
  steps?: number;
}

const RATE_LIMIT_KINDS: Record<string, 'minute' | 'day'> = { rate_limit_minute: 'minute', rate_limit_day: 'day' };

/**
 * The numbers the operator watches. Only counts and durations: no prompts, paths, outputs or user data as labels.
 * Each instance has its own registry, so tests and restarts never share counts.
 */
@Injectable()
export class Metrics {
  private readonly registry = new Registry();
  private readonly activeRuns = new Gauge({
    name: 'agent_active_runs',
    help: 'Runs that are working or waiting for an approval',
    registers: [this.registry],
  });
  private readonly runSteps = new Histogram({
    name: 'agent_run_steps',
    help: 'Model steps of a run that finished normally',
    labelNames: ['state'],
    buckets: [1, 2, 3, 5, 8, 13, 21, 34],
    registers: [this.registry],
  });
  private readonly runDuration = new Histogram({
    name: 'agent_run_duration_seconds',
    help: 'How long runs take until they end',
    labelNames: ['state'],
    buckets: [1, 5, 15, 30, 60, 120, 300, 600],
    registers: [this.registry],
  });
  private readonly tokens = new Counter({
    name: 'model_tokens_total',
    help: 'Tokens the model reported',
    labelNames: ['direction'],
    registers: [this.registry],
  });
  private readonly calls = new Counter({
    name: 'model_calls_total',
    help: 'Model calls by outcome',
    labelNames: ['outcome'],
    registers: [this.registry],
  });
  private readonly rateLimited = new Counter({
    name: 'model_rate_limited_total',
    help: 'Calls the model or our own limiter refused because a limit was hit',
    labelNames: ['kind'],
    registers: [this.registry],
  });
  private readonly limiterWait = new Histogram({
    name: 'rate_limiter_wait_seconds',
    help: 'Time a call waited in the rate limiter (spacing, token window, backoff)',
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
    registers: [this.registry],
  });
  private readonly channels = new Gauge({
    name: 'sse_open_channels',
    help: 'Open event streams',
    registers: [this.registry],
  });
  private readonly pool = new Gauge({
    name: 'db_pool_connections',
    help: 'Connections of the database pool',
    labelNames: ['state'],
    registers: [this.registry],
    collect: () => this.readPool(),
  });
  private poolSource?: () => PoolStats;

  constructor() {
    collectDefaultMetrics({ register: this.registry });
  }

  runStarted(): void {
    this.activeRuns.inc();
  }

  runEnded({ state, seconds, steps }: RunEnd): void {
    this.activeRuns.dec();
    this.runDuration.observe({ state }, seconds);
    if (steps !== undefined) this.runSteps.observe({ state }, steps);
  }

  modelCall(record: { promptTokens: number; outputTokens: number; errorCode: string | null }): void {
    this.tokens.inc({ direction: 'input' }, record.promptTokens);
    this.tokens.inc({ direction: 'output' }, record.outputTokens);
    this.calls.inc({ outcome: record.errorCode ?? 'ok' });
    const kind = record.errorCode ? RATE_LIMIT_KINDS[record.errorCode] : undefined;
    if (kind) this.rateLimited.inc({ kind });
  }

  limiterWaited(seconds: number): void {
    this.limiterWait.observe(seconds);
  }

  channelOpened(): void {
    this.channels.inc();
  }

  channelClosed(): void {
    this.channels.dec();
  }

  private readPool(): void {
    const stats = this.poolSource?.();
    if (!stats) return;
    this.pool.set({ state: 'total' }, stats.total);
    this.pool.set({ state: 'idle' }, stats.idle);
    this.pool.set({ state: 'waiting' }, stats.waiting);
  }

  watchPool(source: () => PoolStats): void {
    this.poolSource = source;
  }

  render(): Promise<string> {
    return this.registry.metrics();
  }
}
