import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { json, renderAt, stubApi } from '../test/render';
import { SettingsPage } from './settings-page';

const settings = {
  hasGeminiKey: false,
  geminiKeyLast4: null,
  modelName: null,
  limits: { requestsPerMinute: 10, tokensPerMinute: 250000, requestsPerDay: 500 },
};

function renderSettings(extra: Record<string, () => Response> = {}) {
  return stubApi({
    'GET /api/auth/me': () =>
      json(200, { id: 'u', email: 'a@b.de', emailConfirmed: true, confirmationRequired: false }),
    'GET /api/users/me/settings': () => json(200, settings),
    'GET /api/usage': () => json(404, { message: 'none' }),
    'GET /api/projects': () => json(200, [{ id: 'p1', name: 'demo' }]),
    'GET /api/auth/sessions': () => json(200, []),
    ...extra,
  });
}

describe('SettingsPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('says when the model settings are saved and stops saying it once they are edited again', async () => {
    renderSettings({ 'PUT /api/users/me/model': () => json(204) });
    renderAt('/settings', '/settings', <SettingsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Saved');

    await userEvent.type(screen.getByLabelText('Model'), 'x');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('says when the Gemini key is saved', async () => {
    renderSettings({ 'PUT /api/users/me/gemini-key': () => json(204) });
    renderAt('/settings', '/settings', <SettingsPage />);
    await userEvent.type(await screen.findByLabelText('New key'), 'AIza-secret');
    await userEvent.click(screen.getByRole('button', { name: 'Save key' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Key saved');
  });

  it('gives the number fields their upper bound as well', async () => {
    renderSettings();
    renderAt('/settings', '/settings', <SettingsPage />);
    const field = await screen.findByLabelText('Requests per minute');
    expect(field).toHaveAttribute('min', '1');
    expect(field).toHaveAttribute('max', '100000000');
  });

  it('tells password managers which account the password belongs to', async () => {
    renderSettings();
    renderAt('/settings', '/settings', <SettingsPage />);
    const username = await screen.findAllByDisplayValue('a@b.de');
    expect(username.length).toBeGreaterThan(0);
    expect(username[0]).toHaveAttribute('autocomplete', 'username');
  });

  it('asks before a project is deleted', async () => {
    const calls = renderSettings({ 'DELETE /api/projects/p1': () => json(204) });
    renderAt('/settings', '/settings', <SettingsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Delete demo' }));
    expect(calls.some((c) => c.key === 'DELETE /api/projects/p1')).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(calls.some((c) => c.key === 'DELETE /api/projects/p1')).toBe(true);
  });
});
