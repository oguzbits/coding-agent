import type { z } from 'zod';
import type { HistoryEntry, ModelProvider, TokenUsage } from '../model/model-provider.js';

export type RunEvent =
  | { type: 'run_started' }
  | { type: 'assistant_message'; text: string }
  | { type: 'tool_call'; callId: string; name: string; args: unknown }
  | { type: 'approval_requested'; callId: string; name: string; args: unknown; preview: string }
  | { type: 'approval_resolved'; callId: string; approved: boolean }
  | { type: 'tool_result'; callId: string; name: string; isError: boolean; output: string }
  | { type: 'run_finished'; steps: number; usage: TokenUsage }
  | { type: 'run_aborted' }
  | { type: 'run_failed'; code: FailureCode; message: string };

export type FailureCode =
  | 'max_steps'
  | 'repeated_failure'
  | 'history_too_large'
  | 'rate_limit_minute'
  | 'rate_limit_day'
  | 'auth'
  | 'bad_request'
  | 'unavailable'
  | 'unknown'
  | 'internal';

export type RunState = 'running' | 'awaiting_approval' | 'finished' | 'aborted' | 'failed';

/** Thrown by a tool for failures the model can act on. The message goes back to the model as the tool result. */
export class ToolError extends Error {}

export interface AgentTool<Schema extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  schema: Schema;
  /** Short text for the approval dialog (a diff, a command line). */
  preview(args: z.infer<Schema>): string;
  execute(args: z.infer<Schema>, context: { signal: AbortSignal }): Promise<string>;
}

export type PolicyDecision = 'allow' | 'ask' | 'reject';

export interface ToolPolicy {
  decide(tool: AgentTool, args: unknown): PolicyDecision;
}

interface ApprovalGate {
  /** Resolves with the user's decision. Rejects when the signal aborts. */
  request(callId: string, signal: AbortSignal): Promise<boolean>;
}

export interface RunSink {
  emit(event: RunEvent): Promise<void>;
  /** Persists the entry and adds it to the history array the run was started with. */
  appendHistory(entry: HistoryEntry): Promise<void>;
  setState(state: RunState): Promise<void>;
}

export interface AgentLimits {
  maxSteps: number;
  /** Largest prompt (in tokens) a run may send; above it the run ends and asks for a new conversation. */
  historyTokenBudget: number;
  /** The same failing call this many times in a row ends the run. */
  repeatFailureLimit: number;
  toolOutputMaxChars: number;
}

export interface AgentDeps {
  provider: ModelProvider;
  tools: AgentTool[];
  policy: ToolPolicy;
  approvals: ApprovalGate;
  sink: RunSink;
  limits: AgentLimits;
  systemPrompt: string;
  signal: AbortSignal;
}

export interface AgentInput {
  model: string;
  apiKey: string;
  /** The history including the new user message. The loop appends through the sink. */
  history: HistoryEntry[];
}

export interface RunOutcome {
  state: 'finished' | 'aborted' | 'failed';
  steps: number;
  usage: TokenUsage;
}
