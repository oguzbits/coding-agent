import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmButton, Section } from './controls';

describe('Section', () => {
  it('does not color its heading with the page background', () => {
    render(<Section title="Password">content</Section>);
    // "base" is the background color token of this theme, so text-base would make the heading invisible.
    expect(screen.getByRole('heading', { name: 'Password' }).className).not.toMatch(/(^|\s)text-base(\s|$)/);
  });
});

describe('ConfirmButton', () => {
  it('asks first and only acts after the confirmation', async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmButton question="Delete demo?" confirmLabel="Delete" onConfirm={onConfirm}>
        Remove
      </ConfirmButton>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText('Delete demo?')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });

  it('does nothing when the question is cancelled', async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmButton question="Delete demo?" confirmLabel="Delete" onConfirm={onConfirm}>
        Remove
      </ConfirmButton>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });
});
