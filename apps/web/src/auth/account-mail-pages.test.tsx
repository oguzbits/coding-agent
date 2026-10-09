import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { json, renderAt, stubApi } from '../test/render';
import { ConfirmEmailPage } from './confirm-email-page';
import { ForgotPasswordPage } from './forgot-password-page';
import { ResetPasswordPage } from './reset-password-page';

describe('pages behind the mailed links', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('confirms the email address with the token from the link', async () => {
    const calls = stubApi({ 'POST /api/auth/confirm-email': () => json(204), 'GET /api/auth/me': () => json(401, {}) });
    renderAt('/confirm-email?token=abc', '/confirm-email', <ConfirmEmailPage />);
    expect(await screen.findByText(/address is confirmed/i)).toBeVisible();
    expect(screen.getByLabelText('location')).toHaveTextContent(/^\/confirm-email$/);
    expect(calls.find((c) => c.key === 'POST /api/auth/confirm-email')?.body).toEqual({ token: 'abc' });
  });

  it('says so when the confirmation link does not work', async () => {
    stubApi({ 'POST /api/auth/confirm-email': () => json(400, { message: 'The link is invalid or expired' }) });
    renderAt('/confirm-email?token=old', '/confirm-email', <ConfirmEmailPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('The link is invalid or expired');
  });

  it('asks for a reset mail and answers the same for every address', async () => {
    const calls = stubApi({ 'POST /api/auth/forgot-password': () => json(202) });
    renderAt('/forgot-password', '/forgot-password', <ForgotPasswordPage />);
    await userEvent.type(await screen.findByLabelText('Email'), 'a@b.de');
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByText(/if an account exists/i)).toBeVisible();
    expect(calls[0]).toEqual({ key: 'POST /api/auth/forgot-password', body: { email: 'a@b.de' } });
  });

  it('sets the new password with the token from the link', async () => {
    const calls = stubApi({ 'POST /api/auth/reset-password': () => json(204) });
    renderAt('/reset-password?token=xyz', '/reset-password', <ResetPasswordPage />);
    await userEvent.type(await screen.findByLabelText('New password'), 'a long new password');
    expect(screen.getByLabelText('location')).toHaveTextContent(/^\/reset-password$/);
    await userEvent.click(screen.getByRole('button', { name: 'Set password' }));
    expect(await screen.findByText(/password was changed/i)).toBeVisible();
    expect(calls[0]?.body).toEqual({ token: 'xyz', newPassword: 'a long new password' });
  });
});
