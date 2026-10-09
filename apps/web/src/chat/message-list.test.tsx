import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ChatItem, ToolItem } from './chat-state';
import { MessageList } from './message-list';

const tool = (key: string, change: Partial<ToolItem> = {}): ToolItem => ({
  kind: 'tool',
  key,
  callId: key,
  name: 'read_file',
  args: { path: `${key}.ts` },
  status: 'done',
  ...change,
});

const show = (items: ChatItem[]) => render(<MessageList items={items} onAnswer={vi.fn()} answering={false} />);

describe('MessageList', () => {
  it('renders Markdown in assistant messages', () => {
    show([{ kind: 'assistant', key: 'a', text: '## Plan\n\nSome **bold** text and `code`.\n\n- one\n- two' }]);
    expect(screen.getByRole('heading', { name: 'Plan' })).toBeVisible();
    expect(screen.getByText('bold').tagName).toBe('STRONG');
    expect(screen.getByText('code').tagName).toBe('CODE');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('does not turn raw HTML or script links in a message into live markup', () => {
    const { container } = show([
      { kind: 'assistant', key: 'a', text: '<img src=x onerror=alert(1)> [click](javascript:alert(1))' },
    ]);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('a[href^="javascript"]')).toBeNull();
  });

  it('opens links in a new tab without handing over the opener', () => {
    show([{ kind: 'assistant', key: 'a', text: '[docs](https://example.com/docs)' }]);
    const link = screen.getByRole('link', { name: 'docs' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('keeps user messages as plain text', () => {
    show([{ kind: 'user', key: 'u', text: 'use **this** literally' }]);
    expect(screen.getByText('use **this** literally')).toBeVisible();
  });

  it('shows a single action as its own card', () => {
    show([tool('one')]);
    expect(screen.getByRole('button', { name: /read_file/ })).toBeVisible();
  });

  it('folds a run of finished actions into one row that opens on demand', async () => {
    show([tool('one'), tool('two'), tool('three')]);
    const group = screen.getByRole('button', { name: /3 actions/ });
    expect(group).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: /read_file/ })).toBeNull();

    await userEvent.click(group);
    expect(screen.getAllByRole('button', { name: /read_file/ })).toHaveLength(3);
  });

  it('keeps a group open while one of its actions waits for a decision', () => {
    show([tool('one'), tool('two', { status: 'awaiting', preview: '+x' })]);
    expect(screen.getByRole('button', { name: 'Approve' })).toBeVisible();
  });

  it('starts a new group after a message in between', () => {
    show([tool('one'), tool('two'), { kind: 'assistant', key: 'a', text: 'ok' }, tool('three')]);
    expect(screen.getByRole('button', { name: /2 actions/ })).toBeVisible();
    expect(screen.getByRole('button', { name: /read_file/ })).toBeVisible();
  });

  it('answers an approval with the id of the call, alone or inside a group', async () => {
    const onAnswer = vi.fn();
    const { rerender } = render(
      <MessageList items={[tool('c1', { status: 'awaiting', preview: '+x' })]} onAnswer={onAnswer} answering={false} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    rerender(
      <MessageList
        items={[tool('c0'), tool('c2', { status: 'awaiting', preview: '+y' })]}
        onAnswer={onAnswer}
        answering={false}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(onAnswer.mock.calls).toEqual([
      ['c1', true],
      ['c2', false],
    ]);
  });
});
