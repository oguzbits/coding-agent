import { z } from 'zod';
import { FakeProvider, turnFromParts } from '../model/fake/fake-provider.js';
import { ModelError, type HistoryEntry, type ProviderPart } from '../model/model-provider.js';
import { runAgent } from './agent-loop.js';
import {
  ToolError,
  type AgentDeps,
  type AgentLimits,
  type AgentTool,
  type PolicyDecision,
  type RunEvent,
  type RunState,
} from './types.js';

const limits: AgentLimits = {
  maxSteps: 10,
  historyTokenBudget: 10_000,
  repeatFailureLimit: 3,
  toolOutputMaxChars: 200,
};
const call = (name: string, args: unknown, id: string, extra: ProviderPart = {}): ProviderPart => ({
  functionCall: { name, args, id },
  ...extra,
});
const text = (value: string): ProviderPart => ({ text: value });

function makeTool(
  name: string,
  run: (args: { value: string }) => Promise<string> | string,
  precheck?: AgentTool['precheck'],
): AgentTool {
  return {
    name,
    description: `${name} tool`,
    kind: 'edit',
    schema: z.object({ value: z.string() }),
    preview: async (args) => `preview:${(args as { value: string }).value}`,
    execute: async (args) => run(args as { value: string }),
    ...(precheck ? { precheck } : {}),
  };
}

function setup(script: ConstructorParameters<typeof FakeProvider>[0], overrides: Partial<AgentDeps> = {}) {
  const provider = new FakeProvider(script);
  const events: RunEvent[] = [];
  const states: RunState[] = [];
  const history: HistoryEntry[] = [{ role: 'user', parts: [{ text: 'do it' }] }];
  const abort = new AbortController();
  let decision: PolicyDecision = 'allow';
  let approvalAnswer: Promise<boolean> | ((signal: AbortSignal) => Promise<boolean>) = Promise.resolve(true);
  const deps: AgentDeps = {
    provider,
    tools: [makeTool('echo', (args) => `echoed ${args.value}`)],
    policy: { decide: () => decision },
    approvals: {
      request: (_id, signal) => (typeof approvalAnswer === 'function' ? approvalAnswer(signal) : approvalAnswer),
    },
    sink: {
      emit: async (event) => void events.push(event),
      appendHistory: async (entry) => void history.push(entry),
      setState: async (state) => void states.push(state),
    },
    limits,
    systemPrompt: 'system',
    signal: abort.signal,
    ...overrides,
  };
  const run = () => runAgent(deps, { model: 'm', apiKey: 'k', history });
  return {
    provider,
    events,
    states,
    history,
    abort,
    deps,
    run,
    setDecision: (value: PolicyDecision) => (decision = value),
    setApproval: (value: typeof approvalAnswer): void => {
      approvalAnswer = value;
    },
  };
}

const types = (events: RunEvent[]) => events.map((event) => event.type);
const results = (events: RunEvent[]) =>
  events.filter((e): e is Extract<RunEvent, { type: 'tool_result' }> => e.type === 'tool_result');

describe('runAgent', () => {
  it('finishes after a plain answer and adds the model turn to the history', async () => {
    const ctx = setup([turnFromParts([text('All good')], { promptTokens: 50, outputTokens: 5 })]);
    const outcome = await ctx.run();
    expect(outcome).toMatchObject({ state: 'finished', steps: 1, usage: { promptTokens: 50, outputTokens: 5 } });
    expect(types(ctx.events)).toEqual(['assistant_message', 'run_finished']);
    expect(ctx.history.at(-1)).toEqual({ role: 'model', parts: [text('All good')] });
    expect(ctx.states).toEqual(['running', 'finished']);
  });

  it('runs a tool call and returns the result; model parts stay unchanged in the history', async () => {
    const modelParts = [call('echo', { value: 'x' }, 'c1', { thoughtSignature: 'SIG' }), text('')];
    const ctx = setup([turnFromParts(modelParts), turnFromParts([text('done')])]);
    expect((await ctx.run()).state).toBe('finished');
    expect(ctx.history[1]).toEqual({ role: 'model', parts: modelParts });
    expect(ctx.history[2]).toEqual({
      role: 'user',
      parts: [{ functionResponse: { id: 'c1', name: 'echo', response: { output: 'echoed x' } } }],
    });
    expect(ctx.provider.requests[1].history).toHaveLength(3);
    expect(types(ctx.events)).toEqual(['tool_call', 'tool_result', 'assistant_message', 'run_finished']);
  });

  it('sends system prompt, model, key and tool declarations with every call', async () => {
    const ctx = setup([turnFromParts([text('hi')])]);
    await ctx.run();
    const request = ctx.provider.requests[0];
    expect(request).toMatchObject({ model: 'm', apiKey: 'k', systemPrompt: 'system' });
    expect(request.tools[0]).toMatchObject({ name: 'echo', description: 'echo tool' });
    expect(request.tools[0].parametersJsonSchema).toMatchObject({ type: 'object', required: ['value'] });
  });

  it('answers several calls of one turn in order within one history entry', async () => {
    const ctx = setup([
      turnFromParts([call('echo', { value: 'a' }, 'c1'), call('echo', { value: 'b' }, 'c2')]),
      turnFromParts([text('ok')]),
    ]);
    await ctx.run();
    const answer = ctx.history[2].parts.map((part) => (part.functionResponse as { id: string }).id);
    expect(answer).toEqual(['c1', 'c2']);
  });

  it('returns invalid arguments to the model as an error and does not run the tool', async () => {
    let ran = false;
    const ctx = setup([turnFromParts([call('echo', { wrong: 1 }, 'c1')]), turnFromParts([text('ok')])], {
      tools: [makeTool('echo', () => ((ran = true), 'x'))],
    });
    await ctx.run();
    expect(ran).toBe(false);
    expect(results(ctx.events)[0]).toMatchObject({ isError: true });
    expect(results(ctx.events)[0].output).toMatch(/invalid arguments/i);
  });

  it('returns an unknown tool name to the model as an error', async () => {
    const ctx = setup([turnFromParts([call('nope', {}, 'c1')]), turnFromParts([text('ok')])]);
    await ctx.run();
    expect(results(ctx.events)[0]).toMatchObject({ isError: true });
    expect(results(ctx.events)[0].output).toMatch(/unknown tool.*echo/i);
  });

  it('passes a ToolError message on, but hides the details of unexpected errors', async () => {
    const tools = [
      makeTool('known', () => {
        throw new ToolError('File not found, use list_files first');
      }),
      makeTool('broken', () => {
        throw new Error('ECONNREFUSED 10.0.0.5:5432 password=hunter2');
      }),
    ];
    const ctx = setup(
      [
        turnFromParts([call('known', { value: 'x' }, 'c1'), call('broken', { value: 'x' }, 'c2')]),
        turnFromParts([text('ok')]),
      ],
      { tools },
    );
    await ctx.run();
    const [first, second] = results(ctx.events);
    expect(first.output).toBe('File not found, use list_files first');
    expect(second.output).toMatch(/unexpected error/i);
    expect(JSON.stringify(ctx.history)).not.toContain('hunter2');
  });

  it('truncates long tool output and says so', async () => {
    const ctx = setup([turnFromParts([call('echo', { value: 'y'.repeat(1000) }, 'c1')]), turnFromParts([text('ok')])]);
    await ctx.run();
    const output = results(ctx.events)[0].output;
    expect(output.length).toBeLessThan(400);
    expect(output).toMatch(/truncated/i);
  });

  describe('approvals', () => {
    it('asks before running, waits in the awaiting state and runs after approval', async () => {
      const ctx = setup([turnFromParts([call('echo', { value: 'w' }, 'c1')]), turnFromParts([text('ok')])]);
      ctx.setDecision('ask');
      await ctx.run();
      expect(types(ctx.events)).toEqual([
        'tool_call',
        'approval_requested',
        'approval_resolved',
        'tool_result',
        'assistant_message',
        'run_finished',
      ]);
      expect(ctx.events[1]).toMatchObject({ callId: 'c1', preview: 'preview:w' });
      expect(ctx.states).toEqual(['running', 'awaiting_approval', 'running', 'finished']);
      expect(results(ctx.events)[0].isError).toBe(false);
    });

    it('does not run a declined call and tells the model, which can carry on', async () => {
      let ran = false;
      const ctx = setup([turnFromParts([call('echo', { value: 'w' }, 'c1')]), turnFromParts([text('understood')])], {
        tools: [makeTool('echo', () => ((ran = true), 'x'))],
      });
      ctx.setDecision('ask');
      ctx.setApproval(Promise.resolve(false));
      expect((await ctx.run()).state).toBe('finished');
      expect(ran).toBe(false);
      expect(results(ctx.events)[0]).toMatchObject({ isError: true });
      expect(results(ctx.events)[0].output).toMatch(/declined/i);
    });

    it('checks a call before asking and returns a failed check to the model without asking', async () => {
      let ran = false;
      const tools = [
        makeTool(
          'echo',
          () => ((ran = true), 'x'),
          async () => {
            throw new ToolError('Read the file first');
          },
        ),
      ];
      const ctx = setup([turnFromParts([call('echo', { value: 'w' }, 'c1')]), turnFromParts([text('ok')])], { tools });
      ctx.setDecision('ask');
      await ctx.run();
      expect(types(ctx.events)).not.toContain('approval_requested');
      expect(ran).toBe(false);
      expect(results(ctx.events)[0]).toMatchObject({ isError: true, output: 'Read the file first' });
    });

    it('hides the details of an unexpected failure in the check', async () => {
      const tools = [
        makeTool(
          'echo',
          () => 'x',
          async () => {
            throw new Error('ENOENT /secret/path');
          },
        ),
      ];
      const ctx = setup([turnFromParts([call('echo', { value: 'w' }, 'c1')]), turnFromParts([text('ok')])], { tools });
      await ctx.run();
      expect(results(ctx.events)[0].output).not.toContain('/secret/path');
    });

    it('rejects without asking when the policy says reject', async () => {
      const ctx = setup([turnFromParts([call('echo', { value: 'w' }, 'c1')]), turnFromParts([text('ok')])]);
      ctx.setDecision('reject');
      await ctx.run();
      expect(types(ctx.events)).not.toContain('approval_requested');
      expect(results(ctx.events)[0].output).toMatch(/not allowed/i);
    });
  });

  describe('stopping', () => {
    it('aborts while waiting for an approval and leaves a valid history', async () => {
      const ctx = setup([turnFromParts([call('echo', { value: 'w' }, 'c1')])]);
      ctx.setDecision('ask');
      ctx.setApproval(
        (signal) =>
          new Promise<boolean>((_resolve, reject) =>
            signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))),
          ),
      );
      const outcomePromise = ctx.run();
      await new Promise((resolve) => setTimeout(resolve, 10));
      ctx.abort.abort();
      expect((await outcomePromise).state).toBe('aborted');
      expect(types(ctx.events).at(-1)).toBe('run_aborted');
      const last = ctx.history.at(-1)!;
      expect(last.role).toBe('user');
      expect(last.parts[0]).toMatchObject({ functionResponse: { id: 'c1', response: { error: expect.any(String) } } });
    });

    it('aborts during the model call', async () => {
      const ctx = setup([{ ...turnFromParts([text('late')]), delayMs: 5_000 }]);
      const outcomePromise = ctx.run();
      ctx.abort.abort();
      expect((await outcomePromise).state).toBe('aborted');
      expect(ctx.states.at(-1)).toBe('aborted');
    });
  });

  describe('limits and failures', () => {
    it('stops at the step limit', async () => {
      const turn = () => turnFromParts([call('echo', { value: String(Math.random()) }, 'c')]);
      const ctx = setup([turn(), turn(), turn(), turn()], { limits: { ...limits, maxSteps: 3 } });
      const outcome = await ctx.run();
      expect(outcome).toMatchObject({ state: 'failed', steps: 3 });
      expect(ctx.events.at(-1)).toMatchObject({ type: 'run_failed', code: 'max_steps' });
    });

    it('stops when the same call keeps failing', async () => {
      const failing = makeTool('echo', () => {
        throw new ToolError('still broken');
      });
      const turn = () => turnFromParts([call('echo', { value: 'same' }, 'c')]);
      const ctx = setup([turn(), turn(), turn(), turn()], { tools: [failing] });
      expect((await ctx.run()).state).toBe('failed');
      expect(ctx.events.at(-1)).toMatchObject({ type: 'run_failed', code: 'repeated_failure' });
      expect(results(ctx.events)).toHaveLength(3);
    });

    it('stops when the prompt outgrows the history budget and points to a new conversation', async () => {
      const big = turnFromParts([call('echo', { value: 'x' }, 'c1')], { promptTokens: 20_000, outputTokens: 5 });
      const ctx = setup([big, turnFromParts([text('never')])]);
      expect((await ctx.run()).state).toBe('failed');
      const last = ctx.events.at(-1);
      expect(last).toMatchObject({ type: 'run_failed', code: 'history_too_large' });
      expect((last as { message: string }).message).toMatch(/new conversation/i);
      expect(ctx.provider.requests).toHaveLength(1);
    });

    it.each([
      ['rate_limit_day', 'Daily quota used up'],
      ['auth', 'Key rejected'],
      ['unavailable', 'Model overloaded'],
    ] as const)('maps a %s model error to a failed run with its message', async (kind, message) => {
      const ctx = setup([new ModelError(kind, message)]);
      expect((await ctx.run()).state).toBe('failed');
      expect(ctx.events.at(-1)).toMatchObject({ type: 'run_failed', code: kind, message });
    });

    it('reports an unexpected provider failure without its details', async () => {
      const ctx = setup([]);
      expect((await ctx.run()).state).toBe('failed');
      expect(ctx.events.at(-1)).toMatchObject({ type: 'run_failed', code: 'internal' });
      expect(JSON.stringify(ctx.events)).not.toMatch(/script/i);
    });
  });
});
