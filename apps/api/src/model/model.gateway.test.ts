import { ConflictException } from '@nestjs/common';
import { DemoProvider } from './fake/demo-provider.js';
import { FakeProvider } from './fake/fake-provider.js';
import { ModelGateway } from './model.gateway.js';
import { RateLimiter, defaultRateLimiterDeps } from './rate-limit/rate-limiter.js';

const defaults = {
  model: 'default-model',
  limits: { requestsPerMinute: 15, tokensPerMinute: 250_000, requestsPerDay: 500 },
};
const limiter = new RateLimiter({
  ...defaultRateLimiterDeps,
  usage: { requestsToday: async () => 0, add: async () => undefined },
  log: { record: async () => undefined },
});
const users = (key: string | null, settings: object = {}) => ({
  getGeminiKey: async () => key,
  getSettings: async () => ({
    hasGeminiKey: key !== null,
    geminiKeyLast4: null,
    modelName: null,
    limits: { requestsPerMinute: null, tokensPerMinute: null, requestsPerDay: null },
    ...settings,
  }),
});

describe('ModelGateway', () => {
  it('runs the demo provider without a key', async () => {
    const gateway = new ModelGateway('fake', defaults, users(null), limiter, new FakeProvider([]), new DemoProvider());
    const prepared = await gateway.prepare('u1');
    expect(prepared).toMatchObject({ model: 'demo', apiKey: '' });
    expect(prepared.format).toBeInstanceOf(DemoProvider);
  });

  it('asks for a key when the real provider is configured and the user has none', async () => {
    const gateway = new ModelGateway(
      'gemini',
      defaults,
      users(null),
      limiter,
      new FakeProvider([]),
      new DemoProvider(),
    );
    await expect(gateway.prepare('u1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('uses the key, the profile model and the profile limits over the defaults', async () => {
    const gateway = new ModelGateway(
      'gemini',
      defaults,
      users('secret-key', {
        modelName: 'profile-model',
        limits: { requestsPerMinute: 5, tokensPerMinute: null, requestsPerDay: null },
      }),
      limiter,
      new FakeProvider([]),
      new DemoProvider(),
    );
    const prepared = await gateway.prepare('u1');
    expect(prepared).toMatchObject({
      model: 'profile-model',
      apiKey: 'secret-key',
      limits: { requestsPerMinute: 5, tokensPerMinute: 250_000, requestsPerDay: 500 },
    });
    expect(prepared.forRun('r1').userMessageParts('hi')).toEqual([{ text: 'hi' }]);
  });
});
