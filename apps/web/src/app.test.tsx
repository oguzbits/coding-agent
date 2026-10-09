import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { App } from './app';
import { json, stubApi } from './test/render';

describe('App routes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    globalThis.history.pushState({}, '', '/');
  });

  it('sends an unknown address to the start, and signed-out users on to the sign-in page', async () => {
    stubApi({ 'GET /api/auth/me': () => json(401, { message: 'Unauthorized' }) });
    globalThis.history.pushState({}, '', '/this/does/not/exist');
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <App />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeVisible();
    expect(globalThis.location.pathname).toBe('/login');
  });
});
