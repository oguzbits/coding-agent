import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { json, renderAt, stubApi } from '../test/render';
import { StartPage } from './start-page';

const me = (emailConfirmed: boolean, confirmationRequired: boolean) => () =>
  json(200, { id: 'u', email: 'a@b.de', emailConfirmed, confirmationRequired });

describe('StartPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('does not start anything while the email address is unconfirmed and confirmation is required', async () => {
    stubApi({ 'GET /api/auth/me': me(false, true), 'GET /api/projects': () => json(200, []) });
    renderAt('/', '/', <StartPage />);
    await userEvent.type(await screen.findByLabelText('Project name'), 'demo');
    await userEvent.type(screen.getByLabelText('Message'), 'hello');
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(screen.getByLabelText('Message')).toHaveAttribute(
      'placeholder',
      expect.stringMatching(/confirm your email/i),
    );
  });

  it('starts normally once the address is confirmed', async () => {
    stubApi({ 'GET /api/auth/me': me(true, true), 'GET /api/projects': () => json(200, []) });
    renderAt('/', '/', <StartPage />);
    await userEvent.type(await screen.findByLabelText('Project name'), 'demo');
    await userEvent.type(screen.getByLabelText('Message'), 'hello');
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
  });
});
