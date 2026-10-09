import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { json, renderAt, stubApi } from '../test/render';
import { AppShell } from './app-shell';

const shellApi = () =>
  stubApi({
    'GET /api/auth/me': () =>
      json(200, { id: 'u', email: 'a@b.de', emailConfirmed: true, confirmationRequired: false }),
    'GET /api/conversations': () => json(200, []),
    'GET /api/projects': () => json(200, []),
  });

describe('AppShell', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('collapses the sidebar on wide screens, remembers it and can bring it back', async () => {
    shellApi();
    const { unmount } = renderAt('/', '/', <AppShell />);
    await userEvent.click(await screen.findByRole('button', { name: 'Collapse sidebar' }));
    expect(screen.getByRole('navigation', { name: 'Sidebar' })).toHaveClass('md:hidden');
    unmount();

    renderAt('/', '/', <AppShell />);
    expect(screen.getByRole('navigation', { name: 'Sidebar' })).toHaveClass('md:hidden');
    await userEvent.click(await screen.findByRole('button', { name: 'Expand sidebar' }));
    expect(screen.getByRole('navigation', { name: 'Sidebar' })).not.toHaveClass('md:hidden');
  });

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
