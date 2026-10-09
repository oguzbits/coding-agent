import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { json, renderAt, stubApi } from '../test/render';
import { DeleteAccountSection, SessionsSection } from './settings-account';

const logins = [
  { id: 'h1', createdAt: '2026-10-01T10:00:00.000Z', userAgent: 'Laptop Browser', current: true },
  { id: 'h2', createdAt: '2026-10-02T10:00:00.000Z', userAgent: 'Phone Browser', current: false },
];

describe('account sections of the settings', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists the logins, marks the current one and ends another one', async () => {
    const calls = stubApi({
      'GET /api/auth/sessions': () => json(200, logins),
      'DELETE /api/auth/sessions/h2': () => json(204),
    });
    renderAt('/', '/', <SessionsSection />);
    const phone = (await screen.findByText('Phone Browser')).closest('li') as HTMLElement;
    expect(screen.getByText('This device')).toBeVisible();
    expect(within(screen.getByText('Laptop Browser').closest('li') as HTMLElement).queryByRole('button')).toBeNull();

    await userEvent.click(within(phone).getByRole('button', { name: /end/i }));

    expect(calls.some((c) => c.key === 'DELETE /api/auth/sessions/h2')).toBe(true);
  });

  it('ends all other logins at once', async () => {
    const calls = stubApi({
      'GET /api/auth/sessions': () => json(200, logins),
      'DELETE /api/auth/sessions': () => json(204),
    });
    renderAt('/', '/', <SessionsSection />);
    await userEvent.click(await screen.findByRole('button', { name: 'End all other logins' }));
    expect(calls.some((c) => c.key === 'DELETE /api/auth/sessions')).toBe(true);
  });

  it('deletes the account only with the password and leaves for the sign-in page', async () => {
    const calls = stubApi({ 'DELETE /api/auth/account': () => json(204) });
    renderAt('/settings', '/settings', <DeleteAccountSection />);
    const button = screen.getByRole('button', { name: 'Delete account' });
    expect(button).toBeDisabled();

    await userEvent.type(screen.getByLabelText('Password'), 'my password');
    await userEvent.click(button);
    expect(calls.map((call) => call.key)).not.toContain('DELETE /api/auth/account');
    await userEvent.click(screen.getByRole('button', { name: 'Delete everything' }));

    expect(calls.find((call) => call.key === 'DELETE /api/auth/account')?.body).toEqual({ password: 'my password' });
    expect(await screen.findByText('Elsewhere')).toBeVisible();
  });

  it('shows the message of the server when the password is wrong', async () => {
    stubApi({ 'DELETE /api/auth/account': () => json(403, { message: 'The password is wrong' }) });
    renderAt('/settings', '/settings', <DeleteAccountSection />);
    await userEvent.type(screen.getByLabelText('Password'), 'nope');
    await userEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete everything' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The password is wrong');
  });
});
