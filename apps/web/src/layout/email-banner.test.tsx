import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { json, renderAt, stubApi } from '../test/render';
import { EmailBanner } from './email-banner';

describe('EmailBanner', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('stays away once the address is confirmed', async () => {
    stubApi({
      'GET /api/auth/me': () =>
        json(200, { id: 'u', email: 'a@b.de', emailConfirmed: true, confirmationRequired: true }),
    });
    renderAt('/', '/', <EmailBanner />);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText(/confirm your email/i)).toBeNull();
  });

  it('stays away when the server does not require confirmation', async () => {
    stubApi({
      'GET /api/auth/me': () =>
        json(200, { id: 'u', email: 'a@b.de', emailConfirmed: false, confirmationRequired: false }),
    });
    renderAt('/', '/', <EmailBanner />);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText(/confirm your email/i)).toBeNull();
  });

  it('asks to confirm and can send the link again', async () => {
    const calls = stubApi({
      'GET /api/auth/me': () =>
        json(200, { id: 'u', email: 'a@b.de', emailConfirmed: false, confirmationRequired: true }),
      'POST /api/auth/resend-confirmation': () => json(202),
    });
    renderAt('/', '/', <EmailBanner />);
    expect(await screen.findByText(/confirm your email/i)).toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: 'Send link again' }));

    expect(calls.some((c) => c.key === 'POST /api/auth/resend-confirmation')).toBe(true);
    expect(await screen.findByText(/link is on its way/i)).toBeVisible();
  });
});
