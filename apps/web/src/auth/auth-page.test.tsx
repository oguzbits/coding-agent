import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { AuthPage } from './auth-page';

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<AuthPage />} />
          <Route path="/" element={<p>Start</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AuthPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('signs in and moves on to the start page', async () => {
    let signedIn = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: Request) => {
        const { pathname } = new URL(request.url);
        if (pathname === '/api/auth/login') {
          signedIn = true;
          return json(200, { id: 'u1', email: 'a@b.de' });
        }
        return signedIn ? json(200, { id: 'u1', email: 'a@b.de' }) : json(401, { message: 'Unauthorized' });
      }),
    );
    renderPage();
    await userEvent.type(await screen.findByLabelText('Email'), 'a@b.de');
    await userEvent.type(screen.getByLabelText('Password'), 'secret-password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Start')).toBeVisible();
  });

  it('shows the message of the server when the sign-in fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(401, { message: 'Invalid credentials' })),
    );
    renderPage();
    await userEvent.type(await screen.findByLabelText('Email'), 'a@b.de');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid credentials');
  });
});
