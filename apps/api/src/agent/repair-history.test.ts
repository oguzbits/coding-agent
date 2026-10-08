import { FakeProvider } from '../model/fake/fake-provider.js';
import type { HistoryEntry } from '../model/model-provider.js';
import { repairHistory } from './repair-history.js';

const provider = new FakeProvider([]);
const user = (text: string): HistoryEntry => ({ role: 'user', parts: [{ text }] });
const modelCalling = (...ids: string[]): HistoryEntry => ({
  role: 'model',
  parts: ids.map((id) => ({ functionCall: { name: 'echo', args: {}, id } })),
});

describe('repairHistory', () => {
  it('leaves a complete history alone', () => {
    const history = [user('a'), { role: 'model', parts: [{ text: 'b' }] } satisfies HistoryEntry];
    expect(repairHistory(history, provider)).toEqual(history);
  });

  it('answers calls that never got a result, for example after a server restart', () => {
    const repaired = repairHistory([user('a'), modelCalling('c1', 'c2')], provider);
    expect(repaired).toHaveLength(3);
    expect(repaired[2].role).toBe('user');
    expect(repaired[2].parts.map((p) => (p.functionResponse as { id: string }).id)).toEqual(['c1', 'c2']);
    expect(repaired[2].parts[0]).toMatchObject({
      functionResponse: { response: { error: expect.stringMatching(/interrupted/i) } },
    });
  });

  it('only adds results for the calls that are missing', () => {
    const partial: HistoryEntry = {
      role: 'user',
      parts: [{ functionResponse: { id: 'c1', name: 'echo', response: { output: 'ok' } } }],
    };
    const repaired = repairHistory([user('a'), modelCalling('c1', 'c2'), partial], provider);
    expect(repaired).toHaveLength(3);
    expect(repaired[2].parts.map((p) => (p.functionResponse as { id: string }).id)).toEqual(['c1', 'c2']);
  });
});
