import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ToolItem } from './chat-state';
import { ToolCard } from './tool-card';

const tool = (change: Partial<ToolItem>): ToolItem => ({
  kind: 'tool',
  key: 'e1',
  callId: 'c1',
  name: 'edit_file',
  args: { path: 'src/a.ts' },
  status: 'running',
  ...change,
});

describe('ToolCard', () => {
  it('shows the preview and asks for a decision while awaiting approval', async () => {
    const onAnswer = vi.fn();
    render(
      <ToolCard tool={tool({ status: 'awaiting', preview: '-old\n+new' })} onAnswer={onAnswer} answering={false} />,
    );
    expect(screen.getByText('+new')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(onAnswer.mock.calls).toEqual([[true], [false]]);
  });

  it('stays collapsed once finished until opened', async () => {
    render(
      <ToolCard tool={tool({ status: 'done', output: 'Edited src/a.ts' })} onAnswer={vi.fn()} answering={false} />,
    );
    expect(screen.queryByText('Edited src/a.ts')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /edit_file/ }));
    expect(screen.getByText('Edited src/a.ts')).toBeVisible();
  });
});
