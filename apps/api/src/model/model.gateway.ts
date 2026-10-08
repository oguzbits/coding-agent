import { ConflictException } from '@nestjs/common';
import type { UsersService } from '../users/users.service.js';
import type { ModelProvider } from './model-provider.js';
import type { LimitSettings, RateLimiter } from './rate-limit/rate-limiter.js';

export type ModelKind = 'fake' | 'gemini';

export interface ModelDefaults {
  model: string;
  limits: LimitSettings;
}

export interface EffectiveModel {
  model: string;
  limits: LimitSettings;
}

export interface PreparedModel extends EffectiveModel {
  apiKey: string;
  /** Knows the part formats; used to build and repair the history before a run exists. */
  format: ModelProvider;
  /** The provider for one run: every call goes through the rate limiter. */
  forRun(runId: string): ModelProvider;
}

type SettingsSource = Pick<UsersService, 'getGeminiKey' | 'getSettings'>;

const DEMO_MODEL = 'demo';

/** Decides which model, key and limits a user's run gets, and hands out the provider that enforces the limits. */
export class ModelGateway {
  constructor(
    private readonly kind: ModelKind,
    private readonly defaults: ModelDefaults,
    private readonly users: SettingsSource,
    private readonly limiter: RateLimiter,
    private readonly gemini: ModelProvider,
    private readonly demo: ModelProvider,
  ) {}

  /** The model and limits that apply to the user: the profile wins over the defaults from the config. */
  async effective(userId: string): Promise<EffectiveModel> {
    const settings = await this.users.getSettings(userId);
    const limits = settings.limits;
    return {
      model: settings.modelName ?? this.defaults.model,
      limits: {
        requestsPerMinute: limits.requestsPerMinute ?? this.defaults.limits.requestsPerMinute,
        tokensPerMinute: limits.tokensPerMinute ?? this.defaults.limits.tokensPerMinute,
        requestsPerDay: limits.requestsPerDay ?? this.defaults.limits.requestsPerDay,
      },
    };
  }

  async prepare(userId: string): Promise<PreparedModel> {
    const effective = await this.effective(userId);
    if (this.kind === 'fake') {
      return { ...effective, model: DEMO_MODEL, apiKey: '', format: this.demo, forRun: () => this.demo };
    }
    const apiKey = await this.users.getGeminiKey(userId);
    if (!apiKey) throw new ConflictException('Add your Gemini API key in your profile first.');
    return {
      ...effective,
      apiKey,
      format: this.gemini,
      forRun: (runId) => this.limiter.wrap(this.gemini, { userId, runId, limits: effective.limits }),
    };
  }
}
