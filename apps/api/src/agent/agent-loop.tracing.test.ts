import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { z } from 'zod';
import { FakeProvider, turnFromParts } from '../model/fake/fake-provider.js';
import { runAgent } from './agent-loop.js';
import type { AgentDeps, AgentTool } from './types.js';

const exporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });

const echo: AgentTool = {
  name: 'echo',
  description: 'echo',
  kind: 'read',
  schema: z.object({ value: z.string() }),
  preview: async () => '',
  execute: async () => 'OUTPUT-SECRET',
};

function deps(script: ConstructorParameters<typeof FakeProvider>[0]): AgentDeps {
  return {
    provider: new FakeProvider(script),
    tools: [echo],
    policy: { decide: () => 'allow' },
    approvals: { request: async () => true },
    sink: { emit: async () => undefined, appendHistory: async () => undefined, setState: async () => undefined },
    limits: { maxSteps: 5, historyTokenBudget: 10_000, repeatFailureLimit: 3, toolOutputMaxChars: 200 },
    systemPrompt: 'SYSTEM-SECRET',
    signal: new AbortController().signal,
  };
}

describe('agent loop traces', () => {
  beforeAll(() => provider.register());
  afterAll(() => provider.shutdown());
  beforeEach(() => exporter.reset());

  async function runWithOneToolCall() {
    const script = [
      turnFromParts([{ functionCall: { name: 'echo', args: { value: 'ARG-SECRET' }, id: 'c1' } }], {
        promptTokens: 10,
        outputTokens: 2,
      }),
      turnFromParts([{ text: 'ANSWER-SECRET' }], { promptTokens: 20, outputTokens: 3 }),
    ];
    await runAgent(deps(script), { model: 'demo', apiKey: 'KEY-SECRET', history: [] });
    return exporter.getFinishedSpans();
  }

  it('has a span per model call with model and token counts, and one per tool call with name and result flag', async () => {
    const spans = await runWithOneToolCall();
    const modelCalls = spans.filter((s) => s.name === 'model.call');
    const toolCalls = spans.filter((s) => s.name === 'tool.call');
    expect(modelCalls.map((s) => s.attributes)).toEqual([
      { 'model.name': 'demo', 'tokens.input': 10, 'tokens.output': 2 },
      { 'model.name': 'demo', 'tokens.input': 20, 'tokens.output': 3 },
    ]);
    expect(toolCalls.map((s) => s.attributes)).toEqual([{ 'tool.name': 'echo', 'tool.error': false }]);
  });

  it('wraps the whole run in a span with its end state and steps, and the calls are its children', async () => {
    const spans = await runWithOneToolCall();
    const run = spans.find((s) => s.name === 'agent.run');
    expect(run?.attributes).toEqual({ 'model.name': 'demo', 'run.state': 'finished', 'run.steps': 2 });
    const children = spans.filter((s) => s.name !== 'agent.run');
    expect(children.length).toBeGreaterThan(0);
    for (const child of children) expect(child.parentSpanContext?.spanId).toBe(run?.spanContext().spanId);
  });

  it('never puts prompts, arguments, outputs or keys into a span', async () => {
    const spans = await runWithOneToolCall();
    const everything = JSON.stringify(spans.map((s) => [s.name, s.attributes, s.events, s.status]));
    for (const secret of ['SYSTEM-SECRET', 'ARG-SECRET', 'OUTPUT-SECRET', 'ANSWER-SECRET', 'KEY-SECRET']) {
      expect(everything).not.toContain(secret);
    }
  });
});
