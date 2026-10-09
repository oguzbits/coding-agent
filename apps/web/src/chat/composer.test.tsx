import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Composer } from './composer';

describe('Composer', () => {
  it('sends the trimmed text on Enter and clears the field', async () => {
    const onSubmit = vi.fn();
    render(<Composer onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText('Message'), '  hello  {Enter}');
    expect(onSubmit).toHaveBeenCalledWith('hello');
    expect(screen.getByLabelText('Message')).toHaveValue('');
  });

  it('keeps a line break on Shift+Enter instead of sending', async () => {
    const onSubmit = vi.fn();
    render(<Composer onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText('Message'), 'a{Shift>}{Enter}{/Shift}b');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Message')).toHaveValue('a\nb');
  });

  it('does not send an empty message', () => {
    render(<Composer onSubmit={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('shows a stop button while a run is going', async () => {
    const onStop = vi.fn();
    render(<Composer onSubmit={vi.fn()} running onStop={onStop} />);
    await userEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(onStop).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
  });
});
