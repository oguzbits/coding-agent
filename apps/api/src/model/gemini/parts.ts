import type { ModelTurn, ProviderPart, TokenUsage, ToolCall, ToolResultForModel } from '../model-provider.js';

// The part formats of the Gemini API. No SDK import here: the fake provider and the adapter share these helpers.

export const userTextParts = (text: string): ProviderPart[] => [{ text }];

export function toolResultParts(results: ToolResultForModel[]): ProviderPart[] {
  return results.map(({ call, output, isError }) => ({
    functionResponse: { id: call.id, name: call.name, response: isError ? { error: output } : { output } },
  }));
}

export function extractToolCalls(parts: ProviderPart[]): ToolCall[] {
  return parts.flatMap((part, index) => {
    const call = part.functionCall as { name?: string; args?: unknown; id?: string } | undefined;
    return call?.name ? [{ id: call.id ?? `call_${index}`, name: call.name, args: call.args ?? {} }] : [];
  });
}

export const responseCallId = (part: ProviderPart): string | undefined =>
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
