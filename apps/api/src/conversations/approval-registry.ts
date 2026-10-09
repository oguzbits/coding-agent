type Waiter = { resolve: (approved: boolean) => void; cleanup: () => void };

/** Holds the tool calls of one run that wait for the user's decision. */
export class ApprovalRegistry {
  private readonly waiting = new Map<string, Waiter>();

  /** With a time limit, `onTimeout` is called when nobody answers in time; it is expected to abort the run. */
  constructor(private readonly options: { timeoutMs?: number; onTimeout?: () => void } = {}) {}

  request(callId: string, signal: AbortSignal): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) return reject(abortError());
      const onAbort = () => {
        this.waiting.get(callId)?.cleanup();
        this.waiting.delete(callId);
        reject(abortError());
      };
      signal.addEventListener('abort', onAbort, { once: true });
      const { timeoutMs, onTimeout } = this.options;
      const timer = timeoutMs && onTimeout ? setTimeout(onTimeout, timeoutMs) : undefined;
      this.waiting.set(callId, {
        resolve,
        cleanup: () => {
          clearTimeout(timer);
          signal.removeEventListener('abort', onAbort);
        },
      });
    });
  }

  /** Returns false when no such call is waiting. */
  resolve(callId: string, approved: boolean): boolean {
    const waiter = this.waiting.get(callId);
    if (!waiter) return false;
    this.waiting.delete(callId);
    waiter.cleanup();
    waiter.resolve(approved);
    return true;
  }

  hasPending(callId: string): boolean {
    return this.waiting.has(callId);
  }
}

const abortError = () => new DOMException('The operation was aborted', 'AbortError');
