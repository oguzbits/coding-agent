/** One part of a message exactly as the provider sent it. Stored and sent back unchanged (thought signatures!). */
export type ProviderPart = Record<string, unknown>;

export interface HistoryEntry {
  role: 'user' | 'model';
  parts: ProviderPart[];
}

export interface ToolDeclaration {
  name: string;
  description: string;
  parametersJsonSchema: Record<string, unknown>;
}

export interface ModelRequest {
  model: string;
  apiKey: string;
  systemPrompt: string;
  history: HistoryEntry[];
  tools: ToolDeclaration[];
}

export interface ToolCall {
  id: string;
  name: string;
  args: unknown;
}

export interface TokenUsage {
  promptTokens: number;
  outputTokens: number;
}

/** The complete answer of one model call. `parts` is what goes into the history, the rest is derived from it. */
export interface ModelTurn {
  parts: ProviderPart[];
  text: string;
  toolCalls: ToolCall[];
  finishReason: string;
  usage: TokenUsage;
}

export interface ToolResultForModel {
  call: ToolCall;
  output: string;
  isError: boolean;
}

export type ModelErrorKind =
  'rate_limit_minute' | 'rate_limit_day' | 'auth' | 'bad_request' | 'unavailable' | 'unknown';

export class ModelError extends Error {
  constructor(
    readonly kind: ModelErrorKind,
    message: string,
    /** How long the vendor asked us to wait, when it said so. */
    readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}

/** The seam between the agent loop and a model vendor. Only adapters know the vendor's part formats. */
export interface ModelProvider {
  /** One call to the model. Rejects with ModelError, or with an AbortError when the signal fires. */
  generate(request: ModelRequest, signal: AbortSignal): Promise<ModelTurn>;
  userMessageParts(text: string): ProviderPart[];
  /** The calls contained in the parts of a model turn. */
  toolCallsIn(parts: ProviderPart[]): ToolCall[];
  /** The id of the call a result part answers, or undefined for any other part. */
  responseCallId(part: ProviderPart): string | undefined;
  /** The parts that answer the calls of the previous model turn, in the order of the calls. */
  toolResultParts(results: ToolResultForModel[]): ProviderPart[];
}
