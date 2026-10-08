import { GeminiPartFormat, turnFromParts } from '../gemini/parts.js';
import { abortError, sleep } from '../abortable-sleep.js';
import { ModelError, type ModelRequest, type ModelTurn } from '../model-provider.js';

export { turnFromParts };

export type ScriptedTurn = ModelTurn & { delayMs?: number };

/** Replays scripted or recorded turns. Used in tests and, via config, to run the whole app without a real key. */
export class FakeProvider extends GeminiPartFormat {
  readonly requests: ModelRequest[] = [];
  private position = 0;

  constructor(private readonly script: (ScriptedTurn | ModelError)[]) {
    super();
  }

  async generate(request: ModelRequest, signal: AbortSignal): Promise<ModelTurn> {
    this.requests.push(structuredClone(request));
    const next = this.script[this.position++];
    if (next === undefined) throw new Error('The fake provider script is exhausted');
    if (next instanceof ModelError) throw next;
    if (next.delayMs) await sleep(next.delayMs, signal);
    if (signal.aborted) throw abortError();
    return next;
  }
}
