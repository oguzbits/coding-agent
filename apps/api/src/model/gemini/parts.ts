import type {
  ModelProvider,
  ModelRequest,
  ModelTurn,
  ProviderPart,
  TokenUsage,
  ToolCall,
  ToolResultForModel,
} from '../model-provider.js';

// The part formats of the Gemini API. No SDK import here: the fake provider and the adapter share these helpers.

const userTextParts = (text: string): ProviderPart[] => [{ text }];

function toolResultParts(results: ToolResultForModel[]): ProviderPart[] {
  return results.map(({ call, output, isError }) => ({
    functionResponse: { id: call.id, name: call.name, response: isError ? { error: output } : { output } },
  }));
}

function extractToolCalls(parts: ProviderPart[]): ToolCall[] {
  return parts.flatMap((part, index) => {
    const call = part.functionCall as { name?: string; args?: unknown; id?: string } | undefined;
    return call?.name ? [{ id: call.id ?? `call_${index}`, name: call.name, args: call.args ?? {} }] : [];
  });
}

const responseCallId = (part: ProviderPart): string | undefined =>
  (part.functionResponse as { id?: string } | undefined)?.id;

const joinText = (parts: ProviderPart[]): string =>
  parts.map((part) => (part.thought === true || typeof part.text !== 'string' ? '' : part.text)).join('');

export function turnFromParts(
  parts: ProviderPart[],
  usage: TokenUsage = { promptTokens: 100, outputTokens: 10 },
  finishReason = 'STOP',
): ModelTurn {
  return { parts, text: joinText(parts), toolCalls: extractToolCalls(parts), finishReason, usage };
}

/** The part of a streamed Gemini response this code reads. */
export interface GeminiChunk {
  candidates?: { content?: { parts?: ProviderPart[] }; finishReason?: string }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
}

/** Joins the chunks of one streamed answer. Parts stay in arrival order and unmerged: the history needs them as sent. */
export function turnFromChunks(chunks: GeminiChunk[]): ModelTurn {
  const parts = chunks.flatMap((chunk) => chunk.candidates?.[0]?.content?.parts ?? []);
  const finishReason = chunks.map((chunk) => chunk.candidates?.[0]?.finishReason).findLast(Boolean) ?? 'STOP';
  const usage = chunks.map((chunk) => chunk.usageMetadata).findLast(Boolean);
  return turnFromParts(
    parts,
    {
      promptTokens: usage?.promptTokenCount ?? 0,
      outputTokens: (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0),
    },
    finishReason,
  );
}

/** The Gemini part formats as ModelProvider methods. Providers that speak Gemini's format (real or fake) extend this. */
export abstract class GeminiPartFormat implements ModelProvider {
  abstract generate(request: ModelRequest, signal: AbortSignal): Promise<ModelTurn>;

  userMessageParts(text: string): ProviderPart[] {
    return userTextParts(text);
  }

  toolCallsIn(parts: ProviderPart[]): ToolCall[] {
    return extractToolCalls(parts);
  }

  responseCallId(part: ProviderPart): string | undefined {
    return responseCallId(part);
  }

  toolResultParts(results: ToolResultForModel[]): ProviderPart[] {
    return toolResultParts(results);
  }
}
