import type { HistoryEntry, ModelRequest } from '../model-provider.js';
import { DemoProvider } from './demo-provider.js';

const request = (history: HistoryEntry[]): ModelRequest => ({
  model: 'demo',
  apiKey: '',
  systemPrompt: '',
  history,
  tools: [],
});
const said = (text: string): HistoryEntry[] => [{ role: 'user', parts: [{ text }] }];
const signal = new AbortController().signal;

describe('DemoProvider', () => {
  const provider = new DemoProvider();

  it('echoes plain text', async () => {
    const turn = await provider.generate(request(said('hello')), signal);
    expect(turn.toolCalls).toEqual([]);
    expect(turn.text).toBe('You said: hello');
  });

  it('turns "read <path>" into a read_file call and "write <path> <content>" into a write_file call', async () => {
    const read = await provider.generate(request(said('read src/a.txt')), signal);
    expect(read.toolCalls).toMatchObject([{ name: 'read_file', args: { path: 'src/a.txt' } }]);
    const write = await provider.generate(request(said('write NOTES.md remember this')), signal);
    expect(write.toolCalls).toMatchObject([
      { name: 'write_file', args: { path: 'NOTES.md', content: 'remember this' } },
    ]);
    expect(write.toolCalls[0].id).toBeTruthy();
  });

  it('turns "run <command>" into a run_command call', async () => {
    const run = await provider.generate(request(said('run npm test')), signal);
    expect(run.toolCalls).toMatchObject([{ name: 'run_command', args: { command: 'npm test' } }]);
  });

  it('reports the tool result after a call', async () => {
    const history: HistoryEntry[] = [
      ...said('read a'),
      { role: 'model', parts: [{ functionCall: { name: 'read_file', args: { path: 'a' }, id: 'c1' } }] },
      { role: 'user', parts: [{ functionResponse: { id: 'c1', name: 'read_file', response: { output: 'content' } } }] },
    ];
    const turn = await provider.generate(request(history), signal);
    expect(turn.toolCalls).toEqual([]);
    expect(turn.text).toContain('content');
  });

  it('waits on "slow" until it is aborted', async () => {
    const controller = new AbortController();
    const pending = provider.generate(request(said('slow')), controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});
