import { Metrics } from './metrics.js';

/** Value of the series with exactly this name and labels in the Prometheus text. */
function valueOf(text: string, series: string): number | undefined {
  const line = text.split('\n').find((candidate) => candidate.startsWith(`${series} `));
  return line === undefined ? undefined : Number(line.slice(series.length + 1));
}

describe('Metrics', () => {
  it('counts active runs up and down', async () => {
    const metrics = new Metrics();
    metrics.runStarted();
    metrics.runStarted();
    metrics.runEnded({ state: 'finished', seconds: 2, steps: 3 });
    expect(valueOf(await metrics.render(), 'agent_active_runs')).toBe(1);
  });

  it('records steps and duration per end state, steps only when the run reports them', async () => {
    const metrics = new Metrics();
    metrics.runStarted();
    metrics.runEnded({ state: 'finished', seconds: 2, steps: 3 });
    metrics.runStarted();
    metrics.runEnded({ state: 'aborted', seconds: 1 });
    const text = await metrics.render();
    expect(valueOf(text, 'agent_run_steps_count{state="finished"}')).toBe(1);
    expect(valueOf(text, 'agent_run_steps_sum{state="finished"}')).toBe(3);
    expect(valueOf(text, 'agent_run_steps_count{state="aborted"}')).toBeUndefined();
    expect(valueOf(text, 'agent_run_duration_seconds_count{state="aborted"}')).toBe(1);
  });

  it('counts tokens by direction and rate limit answers by kind', async () => {
    const metrics = new Metrics();
    metrics.modelCall({ promptTokens: 100, outputTokens: 20, errorCode: null });
    metrics.modelCall({ promptTokens: 0, outputTokens: 0, errorCode: 'rate_limit_minute' });
    metrics.modelCall({ promptTokens: 0, outputTokens: 0, errorCode: 'rate_limit_day' });
    metrics.modelCall({ promptTokens: 0, outputTokens: 0, errorCode: 'unavailable' });
    const text = await metrics.render();
    expect(valueOf(text, 'model_tokens_total{direction="input"}')).toBe(100);
    expect(valueOf(text, 'model_tokens_total{direction="output"}')).toBe(20);
    expect(valueOf(text, 'model_rate_limited_total{kind="minute"}')).toBe(1);
    expect(valueOf(text, 'model_rate_limited_total{kind="day"}')).toBe(1);
    expect(valueOf(text, 'model_calls_total{outcome="ok"}')).toBe(1);
    expect(valueOf(text, 'model_calls_total{outcome="unavailable"}')).toBe(1);
  });

  it('adds up the time spent waiting in the rate limiter', async () => {
    const metrics = new Metrics();
    metrics.limiterWaited(1.5);
    metrics.limiterWaited(0.5);
    expect(valueOf(await metrics.render(), 'rate_limiter_wait_seconds_sum')).toBe(2);
  });

  it('counts open event channels', async () => {
    const metrics = new Metrics();
    metrics.channelOpened();
    metrics.channelOpened();
    metrics.channelClosed();
    expect(valueOf(await metrics.render(), 'sse_open_channels')).toBe(1);
  });

  it('reads the database pool when scraped', async () => {
    const metrics = new Metrics();
    metrics.watchPool(() => ({ total: 10, idle: 7, waiting: 2 }));
    const text = await metrics.render();
    expect(valueOf(text, 'db_pool_connections{state="total"}')).toBe(10);
    expect(valueOf(text, 'db_pool_connections{state="idle"}')).toBe(7);
    expect(valueOf(text, 'db_pool_connections{state="waiting"}')).toBe(2);
  });

  it('includes the lag of the event loop', async () => {
    expect(await new Metrics().render()).toContain('nodejs_eventloop_lag_seconds');
  });

  it('keeps instances apart so tests and restarts do not share counts', async () => {
    const first = new Metrics();
    first.runStarted();
    expect(valueOf(await new Metrics().render(), 'agent_active_runs')).toBe(0);
  });
});
