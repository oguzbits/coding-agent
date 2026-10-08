import { join } from 'node:path';
import { FakeProvider, turnFromParts } from './fake-provider.js';
import { loadSseFixtureTurns } from './sse-fixture.js';
import { ModelError, type ModelRequest } from '../model-provider.js';

const request: ModelRequest = { model: 'm', apiKey: 'k', systemPrompt: 's', history: [], tools: [] };
const never = new AbortController().signal;

describe('FakeProvider', () => {
  it('replays the scripted turns in order and records the requests it got', async () => {
    const provider = new FakeProvider([
      turnFromParts([{ functionCall: { name: 'read_file', args: { path: 'a.txt' }, id: 'c1' } }]),
      turnFromParts([{ text: 'done' }]),
    ]);
    const first = await provider.generate(request, never);
    expect(first.toolCalls).toEqual([{ id: 'c1', name: 'read_file', args: { path: 'a.txt' } }]);
    const second = await provider.generate({ ...request, systemPrompt: 'again' }, never);
    expect(second.text).toBe('done');
    expect(provider.requests.map((r) => r.systemPrompt)).toEqual(['s', 'again']);
  });

  it('fails loudly when the script is exhausted', async () => {
    const provider = new FakeProvider([]);
    await expect(provider.generate(request, never)).rejects.toThrow(/script/i);
  });

  it('throws a scripted ModelError', async () => {
    const provider = new FakeProvider([new ModelError('rate_limit_day', 'daily quota used')]);
    await expect(provider.generate(request, never)).rejects.toMatchObject({ kind: 'rate_limit_day' });
  });

  it('stops waiting when the signal aborts', async () => {
    const provider = new FakeProvider([{ ...turnFromParts([{ text: 'late' }]), delayMs: 5_000 }]);
    const controller = new AbortController();
    const pending = provider.generate(request, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('builds user and tool-result parts in the Gemini shape', () => {
    const provider = new FakeProvider([]);
    expect(provider.userMessageParts('hi')).toEqual([{ text: 'hi' }]);
    const parts = provider.toolResultParts([
      { call: { id: 'c1', name: 'read_file', args: {} }, output: 'content', isError: false },
      { call: { id: 'c2', name: 'read_file', args: {} }, output: 'nope', isError: true },
    ]);
    expect(parts).toEqual([
      { functionResponse: { id: 'c1', name: 'read_file', response: { output: 'content' } } },
      { functionResponse: { id: 'c2', name: 'read_file', response: { error: 'nope' } } },
    ]);
  });
});

describe('recorded Gemini fixtures', () => {
  const turns = loadSseFixtureTurns(join(import.meta.dirname, 'fixtures', 'fix-failing-test'));

  it('loads all seven recorded steps in order', () => {
    expect(turns).toHaveLength(7);
    expect(turns[0].toolCalls.map((call) => call.name)).toEqual(['run_command']);
    expect(turns.at(-1)?.toolCalls).toEqual([]);
  });

  it('keeps the parts unchanged, including the thought signature', () => {
    const [call] = turns[0].parts;
    expect(call).toMatchObject({ functionCall: { name: 'run_command', id: expect.stringMatching(/^call_/) } });
    expect(typeof call.thoughtSignature).toBe('string');
  });

  it('joins the final answer from its text chunks and reports usage', () => {
    const last = turns.at(-1)!;
    expect(last.text).toMatch(/^I fixed the bulk discount condition/);
    expect(last.finishReason).toBe('STOP');
    expect(last.usage.promptTokens).toBeGreaterThan(2000);
    expect(last.usage.outputTokens).toBeGreaterThan(0);
  });
});
