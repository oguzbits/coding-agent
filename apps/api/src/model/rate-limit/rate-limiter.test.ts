import { FakeProvider, turnFromParts, type ScriptedTurn } from '../fake/fake-provider.js';
import { ModelError, type ModelRequest } from '../model-provider.js';
import { pacificDay, RateLimiter, type CallRecord, type LimitSettings, type UsageStore } from './rate-limiter.js';

const request: ModelRequest = {
  model: 'm',
  apiKey: 'k',
  systemPrompt: '',
  history: [{ role: 'user', parts: [{ text: 'x'.repeat(400) }] }], // about 100 tokens
  tools: [],
};
const answer = (promptTokens = 100, outputTokens = 10): ScriptedTurn =>
  turnFromParts([{ text: 'ok' }], { promptTokens, outputTokens });

const limits: LimitSettings = { requestsPerMinute: 15, tokensPerMinute: 250_000, requestsPerDay: 500 };

function setup(script: (ScriptedTurn | ModelError)[], overrides: Partial<LimitSettings> = {}, maxRetries = 3) {
  let time = Date.UTC(2026, 9, 9, 12, 0, 0);
  const sleeps: number[] = [];
  const calls: CallRecord[] = [];
  const usage = { requests: 0, tokens: 0 };
  const store: UsageStore = {
    requestsToday: async () => usage.requests,
    add: async (_user, _model, _day, tokens) => {
      usage.requests += 1;
      usage.tokens += tokens;
    },
  };
  const inner = new FakeProvider(script);
  const limiter = new RateLimiter({
    now: () => time,
    sleep: async (ms, signal) => {
      if (signal.aborted) throw new DOMException('aborted', 'AbortError');
      sleeps.push(ms);
      time += ms;
    },
    random: () => 0.5,
    usage: store,
    log: { record: async (record) => void calls.push(record) },
    paceMargin: 1,
    maxRetries,
    backoffBaseMs: 1000,
  });
  const provider = (userId = 'u1') => limiter.wrap(inner, { userId, runId: 'r1', limits: { ...limits, ...overrides } });
  return { provider, inner, sleeps, calls, usage, advance: (ms: number) => (time += ms), now: () => time };
}
const signal = new AbortController().signal;

describe('pacificDay', () => {
  it('rolls over at midnight Pacific Time', () => {
    expect(pacificDay(Date.UTC(2026, 9, 9, 6, 59))).toBe('2026-10-08');
    expect(pacificDay(Date.UTC(2026, 9, 9, 7, 0))).toBe('2026-10-09');
  });
});

describe('RateLimiter', () => {
  it('does not wait before the first call, then spaces calls by the per-minute limit', async () => {
    const ctx = setup([answer(), answer(), answer()]);
    const provider = ctx.provider();
    await provider.generate(request, signal);
    expect(ctx.sleeps).toEqual([]);
    await provider.generate(request, signal);
    expect(ctx.sleeps).toEqual([4000]);
    ctx.advance(10_000);
    await provider.generate(request, signal);
    expect(ctx.sleeps).toEqual([4000]);
  });

  it('keeps the spacing across runs of the same user, but not between users', async () => {
    const ctx = setup([answer(), answer(), answer()]);
    await ctx.provider('u1').generate(request, signal);
    await ctx.provider('u2').generate(request, signal);
    expect(ctx.sleeps).toEqual([]);
    await ctx.provider('u1').generate(request, signal);
    expect(ctx.sleeps).toEqual([4000]);
  });

  it('waits for the token window when the next call would exceed the per-minute tokens', async () => {
    const ctx = setup([answer(600, 0), answer(600, 0)], { tokensPerMinute: 650, requestsPerMinute: 600 });
    const provider = ctx.provider();
    await provider.generate(request, signal);
    await provider.generate(request, signal);
    expect(ctx.sleeps.reduce((sum, ms) => sum + ms, 0)).toBeGreaterThanOrEqual(59_000);
  });

  it('stops at the daily limit without calling the model', async () => {
    const ctx = setup([answer()], { requestsPerDay: 2 });
    ctx.usage.requests = 2;
    const error = await ctx
      .provider()
      .generate(request, signal)
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ kind: 'rate_limit_day' });
    expect(ctx.inner.requests).toHaveLength(0);
    expect(ctx.calls[0]).toMatchObject({ errorCode: 'rate_limit_day', userId: 'u1', runId: 'r1' });
  });

  it('retries a per-minute limit with backoff and honours the wait Google asked for', async () => {
    const ctx = setup([
      new ModelError('rate_limit_minute', 'slow', 12_000),
      new ModelError('rate_limit_minute', 'slow'),
      answer(),
    ]);
    const turn = await ctx.provider().generate(request, signal);
    expect(turn.text).toBe('ok');
    expect(ctx.sleeps).toContain(12_000);
    expect(ctx.sleeps).toContain(2000); // base 1000 * 2^1 with neutral jitter
    expect(ctx.inner.requests).toHaveLength(3);
  });

  it('retries server errors, then gives up with the last error', async () => {
    const failing = () => new ModelError('unavailable', 'down');
    const ctx = setup([failing(), failing(), failing(), failing()], {}, 3);
    await expect(ctx.provider().generate(request, signal)).rejects.toMatchObject({ kind: 'unavailable' });
    expect(ctx.inner.requests).toHaveLength(4);
  });

  it.each(['rate_limit_day', 'auth', 'bad_request', 'unknown'] as const)('does not retry %s', async (kind) => {
    const ctx = setup([new ModelError(kind, 'no'), answer()]);
    await expect(ctx.provider().generate(request, signal)).rejects.toMatchObject({ kind });
    expect(ctx.inner.requests).toHaveLength(1);
  });

  it('counts successful calls with their real tokens and logs them without content', async () => {
    const ctx = setup([answer(123, 7)]);
    await ctx.provider().generate(request, signal);
    expect(ctx.usage).toEqual({ requests: 1, tokens: 130 });
    expect(ctx.calls).toEqual([
      {
        userId: 'u1',
        runId: 'r1',
        model: 'm',
        promptTokens: 123,
        outputTokens: 7,
        durationMs: expect.any(Number),
        errorCode: null,
      },
    ]);
    expect(JSON.stringify(ctx.calls)).not.toContain('xxxx');
  });

  it('logs failed attempts with their error code and does not count them', async () => {
    const ctx = setup([new ModelError('auth', 'no')]);
    await ctx
      .provider()
      .generate(request, signal)
      .catch(() => undefined);
    expect(ctx.calls).toMatchObject([{ errorCode: 'auth', promptTokens: 0 }]);
    expect(ctx.usage.requests).toBe(0);
  });

  it('stops waiting when aborted and never calls the model', async () => {
    const ctx = setup([answer(), answer()]);
    const provider = ctx.provider();
    await provider.generate(request, signal);
    const controller = new AbortController();
    controller.abort();
    await expect(provider.generate(request, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(ctx.inner.requests).toHaveLength(1);
  });

  it('counts an aborted call, because Google bills it anyway', async () => {
    const controller = new AbortController();
    const ctx = setup([{ ...answer(), delayMs: 10_000 }]);
    const pending = ctx.provider().generate(request, controller.signal);
    await vi.waitFor(() => expect(ctx.inner.requests).toHaveLength(1));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(ctx.usage.requests).toBe(1);
    expect(ctx.calls).toMatchObject([{ errorCode: 'aborted' }]);
  });

  it('passes the format methods through to the wrapped provider', () => {
    const ctx = setup([]);
    expect(ctx.provider().userMessageParts('hi')).toEqual([{ text: 'hi' }]);
  });
});
