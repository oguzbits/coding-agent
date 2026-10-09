import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { json, renderAt, stubApi } from '../test/render';
import { AppShell } from './app-shell';

describe('AppShell', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lets narrow screens open and close the sidebar with a menu button', async () => {
    stubApi({
      'GET /api/auth/me': () =>
        json(200, { id: 'u', email: 'a@b.de', emailConfirmed: true, confirmationRequired: false }),
      'GET /api/conversations': () => json(200, []),
      'GET /api/projects': () => json(200, []),
    });
    renderAt('/', '/', <AppShell />);
    const menu = await screen.findByRole('button', { name: 'Menu' });
    const sidebar = screen.getByRole('navigation', { name: 'Sidebar' });
    expect(menu).toHaveAttribute('aria-expanded', 'false');
    expect(sidebar.className).toContain('max-md:hidden');

    await userEvent.click(menu);
    expect(menu).toHaveAttribute('aria-expanded', 'true');
    expect(sidebar.className).not.toContain('max-md:hidden');

    await userEvent.click(menu);
    expect(menu).toHaveAttribute('aria-expanded', 'false');
  });
});
