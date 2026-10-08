import { abortError, sleep as realSleep } from '../abortable-sleep.js';
import {
  ModelError,
  type ModelProvider,
  type ModelRequest,
  type ModelTurn,
  type ProviderPart,
  type ToolCall,
  type ToolResultForModel,
} from '../model-provider.js';

export interface LimitSettings {
  requestsPerMinute: number;
  tokensPerMinute: number;
  requestsPerDay: number;
}

/** The daily counter. It lives in the database so it survives a restart. */
export interface UsageStore {
  requestsToday(userId: string, model: string, day: string): Promise<number>;
  add(userId: string, model: string, day: string, tokens: number): Promise<void>;
}

/** One model call as it is logged: numbers and codes only, never prompts, answers or keys. */
export interface CallRecord {
  userId: string;
  runId: string | null;
  model: string;
  promptTokens: number;
  outputTokens: number;
  durationMs: number;
  errorCode: string | null;
}

export interface RateLimiterDeps {
  now: () => number;
  sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  random: () => number;
  usage: UsageStore;
  log: { record(record: CallRecord): Promise<void> };
  /** Factor on the gap between requests, so pacing stays safely below the limit. */
  paceMargin: number;
  maxRetries: number;
  backoffBaseMs: number;
}

export interface RunContext {
  userId: string;
  runId: string | null;
  limits: LimitSettings;
}

interface UserState {
  lastStart: number;
  window: { at: number; tokens: number }[];
}

const MINUTE_MS = 60_000;
const RETRYABLE = new Set(['rate_limit_minute', 'unavailable']);
const pacificFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Los_Angeles',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** The day as Google counts it for the daily quota: it resets at midnight Pacific Time. */
export const pacificDay = (epochMs: number): string => pacificFormat.format(epochMs);

const estimateTokens = (request: ModelRequest) =>
  Math.ceil(JSON.stringify([request.systemPrompt, request.history, request.tools]).length / 4);

const isAbort = (error: unknown) => error instanceof Error && error.name === 'AbortError';

export const defaultRateLimiterDeps = {
  now: Date.now,
  sleep: realSleep,
  random: Math.random,
  paceMargin: 1.1,
  maxRetries: 3,
  backoffBaseMs: 2000,
};

/**
 * Every model call goes through here. It spaces calls so the per-minute limit is not hit, keeps the token and day
 * budgets, retries what is worth retrying (the only place that does), and logs each attempt.
 */
export class RateLimiter {
  private readonly users = new Map<string, UserState>();

  constructor(readonly deps: RateLimiterDeps) {}

  wrap(inner: ModelProvider, context: RunContext): ModelProvider {
    return new LimitedProvider(this, inner, context);
  }

  stateOf(userId: string): UserState {
    let state = this.users.get(userId);
    if (!state) {
      state = { lastStart: Number.NEGATIVE_INFINITY, window: [] };
      this.users.set(userId, state);
    }
    return state;
  }
}

class LimitedProvider implements ModelProvider {
  constructor(
    private readonly limiter: RateLimiter,
    private readonly inner: ModelProvider,
    private readonly context: RunContext,
  ) {}

  async generate(request: ModelRequest, signal: AbortSignal): Promise<ModelTurn> {
    const { deps } = this.limiter;
    const { userId, limits } = this.context;
    const day = pacificDay(deps.now());
    if ((await deps.usage.requestsToday(userId, request.model, day)) >= limits.requestsPerDay) {
      await this.log(request, 0, 0, 0, 'rate_limit_day');
      throw new ModelError(
        'rate_limit_day',
        'The daily limit of requests you set in your profile is used up. It resets at midnight Pacific Time.',
      );
    }
    for (let attempt = 0; ; attempt += 1) {
      const entry = await this.takeTurn(request, signal);
      const started = deps.now();
      try {
        const turn = await this.inner.generate(request, signal);
        entry.tokens = turn.usage.promptTokens + turn.usage.outputTokens;
        await deps.usage.add(userId, request.model, day, entry.tokens);
        await this.log(request, turn.usage.promptTokens, turn.usage.outputTokens, deps.now() - started, null);
        return turn;
      } catch (error) {
        const duration = deps.now() - started;
        if (isAbort(error)) {
          await deps.usage.add(userId, request.model, day, entry.tokens);
          await this.log(request, 0, 0, duration, 'aborted');
          throw error;
        }
        if (!(error instanceof ModelError)) throw error;
        await this.log(request, 0, 0, duration, error.kind);
        if (!RETRYABLE.has(error.kind) || attempt >= deps.maxRetries) throw error;
        await deps.sleep(this.backoff(attempt, error.retryAfterMs), signal);
      }
    }
  }

  userMessageParts(text: string): ProviderPart[] {
    return this.inner.userMessageParts(text);
  }

  toolCallsIn(parts: ProviderPart[]): ToolCall[] {
    return this.inner.toolCallsIn(parts);
  }

  responseCallId(part: ProviderPart): string | undefined {
    return this.inner.responseCallId(part);
  }

  toolResultParts(results: ToolResultForModel[]): ProviderPart[] {
    return this.inner.toolResultParts(results);
  }

  private backoff(attempt: number, retryAfterMs = 0): number {
    const { deps } = this.limiter;
    return Math.round(Math.max(retryAfterMs, deps.backoffBaseMs * 2 ** attempt) * (0.5 + deps.random()));
  }

  /** Waits until a call fits both the spacing and the token budget, then books it. */
  private async takeTurn(request: ModelRequest, signal: AbortSignal): Promise<{ at: number; tokens: number }> {
    const { deps } = this.limiter;
    const { limits, userId } = this.context;
    const state = this.limiter.stateOf(userId);
    const estimate = estimateTokens(request);
    const gap = Math.ceil((MINUTE_MS / limits.requestsPerMinute) * deps.paceMargin);
    for (;;) {
      const now = deps.now();
      state.window = state.window.filter((entry) => entry.at > now - MINUTE_MS);
      const used = state.window.reduce((sum, entry) => sum + entry.tokens, 0);
      const tokenWait =
        state.window.length > 0 && used + estimate > limits.tokensPerMinute ? state.window[0].at + MINUTE_MS - now : 0;
      const wait = Math.max(state.lastStart + gap - now, tokenWait);
      if (wait <= 0) break;
      await deps.sleep(wait, signal);
    }
    if (signal.aborted) throw abortError();
    const entry = { at: deps.now(), tokens: estimate };
    state.window.push(entry);
    state.lastStart = entry.at;
    return entry;
  }

  private log(
    request: ModelRequest,
    promptTokens: number,
    outputTokens: number,
    durationMs: number,
    errorCode: string | null,
  ) {
    return this.limiter.deps.log.record({
      userId: this.context.userId,
      runId: this.context.runId,
      model: request.model,
      promptTokens,
      outputTokens,
      durationMs,
      errorCode,
    });
  }
}
