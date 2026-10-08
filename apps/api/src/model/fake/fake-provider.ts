import { extractToolCalls, responseCallId, toolResultParts, turnFromParts, userTextParts } from '../gemini/parts.js';
import {
  ModelError,
  type ModelProvider,
  type ModelRequest,
  type ModelTurn,
  type ProviderPart,
  type ToolResultForModel,
} from '../model-provider.js';

export { turnFromParts };

export type ScriptedTurn = ModelTurn & { delayMs?: number };

/** Replays scripted or recorded turns. Used in tests and, via config, to run the whole app without a real key. */
export class FakeProvider implements ModelProvider {
  readonly requests: ModelRequest[] = [];
  private position = 0;

  constructor(private readonly script: (ScriptedTurn | ModelError)[]) {}

  async generate(request: ModelRequest, signal: AbortSignal): Promise<ModelTurn> {
    this.requests.push(structuredClone(request));
    const next = this.script[this.position++];
    if (next === undefined) throw new Error('The fake provider script is exhausted');
    if (next instanceof ModelError) throw next;
    if (next.delayMs) await sleep(next.delayMs, signal);
    if (signal.aborted) throw abortError();
    return next;
  }

  userMessageParts(text: string): ProviderPart[] {
    return userTextParts(text);
  }

  toolCallsIn(parts: ProviderPart[]) {
    return extractToolCalls(parts);
  }

  responseCallId(part: ProviderPart) {
    return responseCallId(part);
  }

  toolResultParts(results: ToolResultForModel[]): ProviderPart[] {
    return toolResultParts(results);
  }
}

const abortError = () => new DOMException('The operation was aborted', 'AbortError');

export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(abortError());
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(abortError());
      },
      { once: true },
    );
  });
}
