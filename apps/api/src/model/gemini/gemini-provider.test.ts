import { readFileSync } from 'node:fs';
import { ApiError, type GenerateContentParameters, type GenerateContentResponse } from '@google/genai';
import { loadSseFixtureTurns } from '../fake/sse-fixture.js';
import { ModelError, type ModelRequest } from '../model-provider.js';
import { GeminiProvider, type GeminiClient } from './gemini-provider.js';

const fixtureDir = new URL('../fake/fixtures/fix-failing-test/', import.meta.url);
const chunksOf = (step: number): GenerateContentResponse[] =>
  readFileSync(new URL(`run-2-step-${step}.sse`, fixtureDir), 'utf8')
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice(6)) as GenerateContentResponse);

const request: ModelRequest = {
  model: 'test-model',
  apiKey: 'AIza-secret-key-1234',
  systemPrompt: 'be brief',
  history: [{ role: 'user', parts: [{ text: 'hi' }] }],
  tools: [{ name: 'read_file', description: 'reads', parametersJsonSchema: { type: 'object' } }],
};
const signal = new AbortController().signal;

function clientReturning(chunks: GenerateContentResponse[], seen: GenerateContentParameters[] = []): GeminiClient {
  return {
    models: {
      generateContentStream: async (params) => {
        seen.push(params);
        return (async function* () {
          yield* chunks;
        })();
      },
    },
  };
}
const clientFailing = (error: unknown): GeminiClient => ({
  models: {
    generateContentStream: async () => {
      throw error;
    },
  },
});
const apiError = (status: number, body: unknown) => new ApiError({ status, message: JSON.stringify(body) });
const failure = async (error: unknown): Promise<ModelError> => {
  const provider = new GeminiProvider(() => clientFailing(error));
  return provider.generate(request, signal).then(
    () => {
      throw new Error('should have failed');
    },
    (caught: unknown) => caught as ModelError,
  );
};

describe('GeminiProvider', () => {
  it('turns recorded streams into the same turns the loop tests use, parts unchanged', async () => {
    const expected = loadSseFixtureTurns(fileURLToPathOf(fixtureDir));
    for (const [index, turn] of expected.entries()) {
      const provider = new GeminiProvider(() => clientReturning(chunksOf(index + 1)));
      expect(await provider.generate(request, signal)).toEqual(turn);
    }
  });

  it('sends model, history, system prompt, tool declarations and the abort signal', async () => {
    const seen: GenerateContentParameters[] = [];
    const provider = new GeminiProvider(() => clientReturning(chunksOf(7), seen));
    await provider.generate(request, signal);
    expect(seen[0]).toMatchObject({
      model: 'test-model',
      contents: request.history,
      config: {
        systemInstruction: 'be brief',
        tools: [{ functionDeclarations: [{ name: 'read_file', parametersJsonSchema: { type: 'object' } }] }],
        abortSignal: signal,
      },
    });
  });

  it('uses the key of the request for the client', async () => {
    const keys: string[] = [];
    const provider = new GeminiProvider((key) => (keys.push(key), clientReturning(chunksOf(7))));
    await provider.generate(request, signal);
    expect(keys).toEqual([request.apiKey]);
  });

  it('omits the tools block when there are no tools', async () => {
    const seen: GenerateContentParameters[] = [];
    await new GeminiProvider(() => clientReturning(chunksOf(7), seen)).generate({ ...request, tools: [] }, signal);
    expect(seen[0].config?.tools).toBeUndefined();
  });

  it('counts thought tokens as output', async () => {
    const chunks: GenerateContentResponse[] = [
      {
        candidates: [{ content: { parts: [{ text: 'x' }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 3, thoughtsTokenCount: 7 },
      } as GenerateContentResponse,
    ];
    const turn = await new GeminiProvider(() => clientReturning(chunks)).generate(request, signal);
    expect(turn.usage).toEqual({ promptTokens: 10, outputTokens: 10 });
  });

  describe('errors', () => {
    it('maps 401 and 403 to auth without echoing the key', async () => {
      for (const status of [401, 403]) {
        const error = await failure(apiError(status, { error: { code: status, message: `bad ${request.apiKey}` } }));
        expect(error.kind).toBe('auth');
        expect(error.message).not.toContain(request.apiKey);
      }
    });

    it("maps 400 to bad_request and keeps Google's reason", async () => {
      const error = await failure(
        apiError(400, { error: { code: 400, message: 'Function call is missing a thought_signature' } }),
      );
      expect(error).toMatchObject({ kind: 'bad_request' });
      expect(error.message).toContain('thought_signature');
    });

    it('tells a daily quota from a per-minute quota', async () => {
      const quota = (quotaId: string) => ({
        error: {
          code: 429,
          status: 'RESOURCE_EXHAUSTED',
          message: 'quota',
          details: [
            { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId }] },
            { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '12s' },
          ],
        },
      });
      const day = await failure(apiError(429, quota('GenerateRequestsPerDayPerProjectPerModel-FreeTier')));
      expect(day.kind).toBe('rate_limit_day');
      const minute = await failure(apiError(429, quota('GenerateRequestsPerMinutePerProjectPerModel-FreeTier')));
      expect(minute).toMatchObject({ kind: 'rate_limit_minute', retryAfterMs: 12_000 });
    });

    it('treats a 429 without details as a per-minute limit', async () => {
      expect((await failure(apiError(429, { error: { code: 429, message: 'slow down' } }))).kind).toBe(
        'rate_limit_minute',
      );
      expect((await failure(new ApiError({ status: 429, message: 'not json' }))).kind).toBe('rate_limit_minute');
    });

    it('maps 5xx and network failures to unavailable, other statuses to unknown', async () => {
      expect((await failure(apiError(503, { error: { code: 503, message: 'overloaded' } }))).kind).toBe('unavailable');
      expect((await failure(new TypeError('fetch failed'))).kind).toBe('unavailable');
      expect((await failure(apiError(418, { error: { message: 'teapot' } }))).kind).toBe('unknown');
    });

    it('rethrows an abort as an AbortError, not a ModelError', async () => {
      const controller = new AbortController();
      controller.abort();
      const provider = new GeminiProvider(() => clientFailing(new Error('The operation was aborted')));
      await expect(provider.generate(request, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    });
  });

  it('builds user and tool result parts in the Gemini format', () => {
    const provider = new GeminiProvider(() => clientReturning([]));
    expect(provider.userMessageParts('hi')).toEqual([{ text: 'hi' }]);
    const call = { id: 'c1', name: 'read_file', args: {} };
    const [part] = provider.toolResultParts([{ call, output: 'ok', isError: false }]);
    expect(provider.responseCallId(part)).toBe('c1');
  });
});

function fileURLToPathOf(url: URL): string {
  return url.pathname;
}
