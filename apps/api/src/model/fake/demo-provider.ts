import { randomUUID } from 'node:crypto';
import { GeminiPartFormat, turnFromParts } from '../gemini/parts.js';
import type { HistoryEntry, ModelRequest, ModelTurn, ProviderPart } from '../model-provider.js';
import { sleep } from '../abortable-sleep.js';

const SLOW_MS = 10_000;

const lastUserText = (history: HistoryEntry[]): string | undefined => {
  const last = history.at(-1);
  const part =
    last?.role === 'user' ? last.parts.findLast((candidate) => typeof candidate.text === 'string') : undefined;
  return part ? String(part.text) : undefined;
};

const lastToolResult = (history: HistoryEntry[]): string | undefined => {
  const last = history.at(-1);
  const response = last?.role === 'user' ? last.parts.find((part) => part.functionResponse) : undefined;
  if (!response) return undefined;
  const body = (response.functionResponse as { response: { output?: string; error?: string } }).response;
  return body.output ?? body.error ?? '';
};

/**
 * Answers from simple commands in the user's message, so the whole app can run without a model:
 * `read <path>`, `write <path> <content>`, `slow` (waits, abortable), anything else is echoed.
 */
export class DemoProvider extends GeminiPartFormat {
  async generate(request: ModelRequest, signal: AbortSignal): Promise<ModelTurn> {
    const usage = { promptTokens: request.history.length * 10, outputTokens: 5 };
    const result = lastToolResult(request.history);
    if (result !== undefined) return turnFromParts([{ text: `Done. Result: ${result.slice(0, 200)}` }], usage);

    const text = lastUserText(request.history) ?? '';
    const call = (name: string, args: unknown): ProviderPart => ({ functionCall: { name, args, id: randomUUID() } });
    if (text.startsWith('read ')) return turnFromParts([call('read_file', { path: text.slice(5).trim() })], usage);
    if (text.startsWith('write ')) {
      const [file = '', ...content] = text.slice(6).trim().split(' ');
      return turnFromParts([call('write_file', { path: file, content: content.join(' ') })], usage);
    }
    if (text.trim() === 'slow') {
      await sleep(SLOW_MS, signal);
      return turnFromParts([{ text: 'Slow answer.' }], usage);
    }
    return turnFromParts([{ text: `You said: ${text}` }], usage);
  }
}
