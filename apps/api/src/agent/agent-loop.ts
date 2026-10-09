import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { withSpan } from '../tracing/with-span.js';
import {
  ModelError,
  type ModelTurn,
  type TokenUsage,
  type ToolCall,
  type ToolDeclaration,
  type ToolResultForModel,
} from '../model/model-provider.js';
import {
  ToolError,
  type AgentDeps,
  type AgentInput,
  type AgentTool,
  type FailureCode,
  type RunEvent,
  type RunOutcome,
} from './types.js';

const isAbort = (error: unknown) => error instanceof Error && error.name === 'AbortError';

function toDeclarations(tools: AgentTool[]): ToolDeclaration[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parametersJsonSchema: z.toJSONSchema(tool.schema) as Record<string, unknown>,
  }));
}

type Streak = { key: string; count: number };
type ModelStep = { kind: 'turn'; turn: ModelTurn } | { kind: 'end'; outcome: Ending };
type Ending = { kind: 'aborted' } | { kind: 'failed'; code: FailureCode; message: string };

async function callModel(deps: AgentDeps, input: AgentInput, declarations: ToolDeclaration[]): Promise<ModelStep> {
  try {
    const turn = await withSpan('model.call', { 'model.name': input.model }, async (span) => {
      const answer = await deps.provider.generate(
        {
          model: input.model,
          apiKey: input.apiKey,
          systemPrompt: deps.systemPrompt,
          history: input.history,
          tools: declarations,
        },
        deps.signal,
      );
      span.setAttributes({ 'tokens.input': answer.usage.promptTokens, 'tokens.output': answer.usage.outputTokens });
      return answer;
    });
    return { kind: 'turn', turn };
  } catch (error) {
    if (isAbort(error)) return { kind: 'end', outcome: { kind: 'aborted' } };
    if (error instanceof ModelError)
      return { kind: 'end', outcome: { kind: 'failed', code: error.kind, message: error.message } };
    return {
      kind: 'end',
      outcome: { kind: 'failed', code: 'internal', message: 'The model call failed unexpectedly.' },
    };
  }
}

/** Runs the calls of one model turn in order. Once the run is stopped, the remaining calls are answered as stopped. */
async function runToolCalls(deps: AgentDeps, calls: ToolCall[], streak: Streak) {
  const answers: ToolResultForModel[] = [];
  let stopped = false;
  for (const call of calls) {
    if (stopped || deps.signal.aborted) {
      stopped = true;
      answers.push({ call, output: 'The run was stopped by the user.', isError: true });
      continue;
    }
    try {
      const answer = await withSpan('tool.call', { 'tool.name': call.name }, async (span) => {
        const result = await handleCall(deps, call);
        span.setAttribute('tool.error', result.isError);
        return result;
      });
      answers.push(answer);
      streak = nextStreak(streak, call, answer.isError);
    } catch (error) {
      if (!isAbort(error)) throw error;
      stopped = true;
      answers.push({ call, output: 'The run was stopped by the user.', isError: true });
    }
  }
  return { answers, stopped, streak };
}

/**
 * The agent loop: call the model, run the tools it asks for, send the results back, repeat until the model answers
 * without tools. It knows neither HTTP nor the database; everything it touches comes in through `deps`.
 */
export function runAgent(deps: AgentDeps, input: AgentInput): Promise<RunOutcome> {
  return withSpan('agent.run', { 'model.name': input.model }, async (span) => {
    const outcome = await runLoop(deps, input);
    span.setAttributes({ 'run.state': outcome.state, 'run.steps': outcome.steps });
    return outcome;
  });
}

async function runLoop(deps: AgentDeps, input: AgentInput): Promise<RunOutcome> {
  const { provider, sink, limits, signal } = deps;
  const declarations = toDeclarations(deps.tools);
  const usage: TokenUsage = { promptTokens: 0, outputTokens: 0 };
  let steps = 0;
  let streak: Streak = { key: '', count: 0 };

  const end = async (state: 'finished' | 'aborted' | 'failed', event: RunEvent): Promise<RunOutcome> => {
    await sink.emit(event);
    await sink.setState(state);
    return { state, steps, usage: { ...usage } };
  };
  const ending = (outcome: Ending) =>
    outcome.kind === 'aborted'
      ? end('aborted', { type: 'run_aborted' })
      : end('failed', { type: 'run_failed', code: outcome.code, message: outcome.message });
  const fail = (code: FailureCode, message: string) => ending({ kind: 'failed', code, message });

  await sink.setState('running');

  for (;;) {
    if (signal.aborted) return ending({ kind: 'aborted' });
    if (steps >= limits.maxSteps) {
      return fail('max_steps', `The run stopped after ${limits.maxSteps} steps. Send a message to continue.`);
    }

    const step = await callModel(deps, input, declarations);
    if (step.kind === 'end') return ending(step.outcome);
    const { turn } = step;

    steps += 1;
    usage.promptTokens += turn.usage.promptTokens;
    usage.outputTokens += turn.usage.outputTokens;
    await sink.appendHistory({ role: 'model', parts: turn.parts });
    if (turn.text.trim()) await sink.emit({ type: 'assistant_message', text: turn.text });

    if (turn.toolCalls.length === 0) return end('finished', { type: 'run_finished', steps, usage: { ...usage } });
    if (turn.usage.promptTokens > limits.historyTokenBudget) {
      return fail(
        'history_too_large',
        'This conversation has grown too large for the model. Start a new conversation to continue.',
      );
    }

    const round = await runToolCalls(deps, turn.toolCalls, streak);
    streak = round.streak;
    await sink.appendHistory({ role: 'user', parts: provider.toolResultParts(round.answers) });

    if (round.stopped) return ending({ kind: 'aborted' });
    if (streak.count >= limits.repeatFailureLimit) {
      return fail('repeated_failure', 'The same action failed several times in a row, so the run was stopped.');
    }
  }
}

function nextStreak(previous: Streak, call: ToolCall, isError: boolean) {
  if (!isError) return { key: '', count: 0 };
  const key = `${call.name}:${JSON.stringify(call.args)}`;
  return { key, count: previous.key === key ? previous.count + 1 : 1 };
}

/** Runs one tool call through validation, policy and approval. Every failure becomes a result for the model. */
async function handleCall(deps: AgentDeps, call: ToolCall): Promise<ToolResultForModel> {
  const { sink, signal, limits } = deps;
  // The model's own ids can repeat across turns (or be missing), so events and approvals use ids made here.
  const callId = randomUUID();
  const finish = async (output: string, isError: boolean): Promise<ToolResultForModel> => {
    const shown = truncate(output, limits.toolOutputMaxChars);
    await sink.emit({ type: 'tool_result', callId, name: call.name, isError, output: shown });
    return { call, output: shown, isError };
  };

  await sink.emit({ type: 'tool_call', callId, name: call.name, args: call.args });

  const tool = deps.tools.find((candidate) => candidate.name === call.name);
  if (!tool) {
    const available = deps.tools.map((candidate) => candidate.name).join(', ');
    return finish(`Unknown tool "${call.name}". Available tools: ${available}`, true);
  }

  const parsed = tool.schema.safeParse(call.args);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);
    return finish(`Invalid arguments for ${tool.name}: ${issues.join('; ')}`, true);
  }

  const failure = await runStep(() => tool.precheck?.(parsed.data));
  if (failure) return finish(failure, true);

  const decision = await deps.policy.decide(tool, parsed.data);
  if (decision === 'reject') return finish('This action is not allowed in the current mode.', true);
  if (decision === 'ask') {
    const preview = await tool.preview(parsed.data).catch(() => 'No preview available.');
    // Listen before announcing: the announcement is stored first, and an early answer must not find nobody waiting.
    const answer = deps.approvals.request(callId, signal);
    answer.catch(() => undefined);
    await sink.emit({ type: 'approval_requested', callId, name: call.name, args: parsed.data, preview });
    await sink.setState('awaiting_approval');
    const approved = await answer;
    await sink.emit({ type: 'approval_resolved', callId, approved });
    await sink.setState('running');
    if (!approved) return finish('The user declined this action.', true);
  }

  let output = '';
  const executionFailure = await runStep(async () => {
    output = await tool.execute(parsed.data, { signal });
  });
  return executionFailure ? finish(executionFailure, true) : finish(output, false);
}

/** Runs one step of a tool call. Returns the message for the model if it failed, undefined if it worked. */
async function runStep(step: () => Promise<unknown> | undefined): Promise<string | undefined> {
  try {
    await step();
    return undefined;
  } catch (error) {
    if (isAbort(error)) throw error;
    return error instanceof ToolError ? error.message : 'The tool failed with an unexpected error.';
  }
}

function truncate(output: string, maxChars: number): string {
  if (output.length <= maxChars) return output;
  return `${output.slice(0, maxChars)}\n[output truncated: ${output.length - maxChars} more characters]`;
}
