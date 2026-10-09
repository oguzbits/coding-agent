import { emptyChat, reduceChat, type StreamedEvent } from './chat-state';

const at = (seq: number, event: StreamedEvent['event']): StreamedEvent => ({ seq, event });
const apply = (events: StreamedEvent[]) => events.reduce(reduceChat, emptyChat);

describe('reduceChat', () => {
  it('builds the transcript of a simple run and ends not running', () => {
    const state = apply([
      at(1, { type: 'run_started' }),
      at(2, { type: 'user_message', text: 'hello' }),
      at(3, { type: 'assistant_message', text: 'hi there' }),
      at(4, { type: 'run_finished', steps: 1, usage: { promptTokens: 1, outputTokens: 1 } }),
    ]);
    expect(state.items.map((item) => [item.kind, 'text' in item ? item.text : ''])).toEqual([
      ['user', 'hello'],
      ['assistant', 'hi there'],
    ]);
    expect(state.running).toBe(false);
    expect(state.lastSeq).toBe(4);
  });

  it('is running between run_started and the end', () => {
    expect(apply([at(1, { type: 'run_started' })]).running).toBe(true);
  });

  it('ignores events it has already seen, so a replay after reconnecting adds nothing', () => {
    const events = [at(1, { type: 'run_started' }), at(2, { type: 'user_message', text: 'x' })];
    expect(apply([...events, ...events]).items).toHaveLength(1);
  });

  it('follows a tool call through approval to its result', () => {
    const call = { callId: 'c1', name: 'edit_file', args: { path: 'a.txt' } };
    const waiting = apply([
      at(1, { type: 'run_started' }),
      at(2, { type: 'tool_call', ...call }),
      at(3, { type: 'approval_requested', ...call, preview: '-a\n+b' }),
    ]);
    expect(waiting.items[0]).toMatchObject({ kind: 'tool', status: 'awaiting', preview: '-a\n+b' });
    expect(waiting.pendingCallId).toBe('c1');

    const done = [
      at(4, { type: 'approval_resolved', callId: 'c1', approved: true }),
      at(5, { type: 'tool_result', callId: 'c1', name: 'edit_file', isError: false, output: 'ok' }),
    ].reduce(reduceChat, waiting);
    expect(done.items[0]).toMatchObject({ status: 'done', output: 'ok', approved: true });
    expect(done.pendingCallId).toBeUndefined();
  });

  it('marks declined and failed tool calls', () => {
    const call = { callId: 'c1', name: 'run_command', args: { command: 'ls' } };
    const declined = apply([
      at(1, { type: 'tool_call', ...call }),
      at(2, { type: 'approval_requested', ...call, preview: '$ ls' }),
      at(3, { type: 'approval_resolved', callId: 'c1', approved: false }),
      at(4, { type: 'tool_result', callId: 'c1', name: 'run_command', isError: true, output: 'declined' }),
    ]);
    expect(declined.items[0]).toMatchObject({ status: 'rejected', approved: false });
    const failed = apply([
      at(1, { type: 'tool_call', ...call }),
      at(2, { type: 'tool_result', callId: 'c1', name: 'run_command', isError: true, output: 'boom' }),
    ]);
    expect(failed.items[0]).toMatchObject({ status: 'error', output: 'boom' });
  });

  it('shows why a run failed or was stopped', () => {
    const failed = apply([
      at(1, { type: 'run_started' }),
      at(2, { type: 'run_failed', code: 'rate_limit_day', message: 'Daily limit used up' }),
    ]);
    expect(failed.items.at(-1)).toMatchObject({ kind: 'notice', tone: 'error', text: 'Daily limit used up' });
    expect(failed.running).toBe(false);
    const stopped = apply([at(1, { type: 'run_started' }), at(2, { type: 'run_aborted' })]);
    expect(stopped.items.at(-1)).toMatchObject({ kind: 'notice', tone: 'info' });
    expect(stopped.running).toBe(false);
  });
});
