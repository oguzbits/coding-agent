import type { HistoryEntry, ModelProvider } from '../model/model-provider.js';

const INTERRUPTED =
  'The run was interrupted before this action finished. Check the current state before you rely on it.';

/**
 * A model turn that asked for tools must be followed by answers to every call, or the next request is rejected.
 * After a crash or restart the answers can be missing; this adds a result saying the call was interrupted.
 */
export function repairHistory(history: HistoryEntry[], provider: ModelProvider): HistoryEntry[] {
  const repaired: HistoryEntry[] = [];
  for (let index = 0; index < history.length; index += 1) {
    const entry = history[index];
    repaired.push(entry);
    const calls = entry.role === 'model' ? provider.toolCallsIn(entry.parts) : [];
    if (calls.length === 0) continue;

    const next = history[index + 1];
    const existing = next?.role === 'user' ? next.parts : [];
    const answered = new Map(existing.map((part) => [provider.responseCallId(part), part]));
    const missing = calls.filter((call) => !answered.has(call.id));
    if (missing.length === 0) continue;

    const synthetic = provider.toolResultParts(missing.map((call) => ({ call, output: INTERRUPTED, isError: true })));
    const byId = new Map([...answered, ...synthetic.map((part) => [provider.responseCallId(part), part] as const)]);
    repaired.push({ role: 'user', parts: calls.map((call) => byId.get(call.id)!) });
    if (existing.length > 0) index += 1;
  }
  return repaired;
}
