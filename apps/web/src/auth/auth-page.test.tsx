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

function renderPage(path: string | { pathname: string; state?: unknown } = '/login') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
          <Route path="/" element={<p>Start</p>} />
          <Route path="/c/:id" element={<p>Chat page</p>} />
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

  it('has its own address for creating an account and links between the two pages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(401, { message: 'Unauthorized' })),
    );
    renderPage();
    await userEvent.click(await screen.findByRole('link', { name: 'No account yet? Create one' }));
    expect(await screen.findByRole('heading', { name: 'Create an account' })).toBeVisible();
    await userEvent.click(screen.getByRole('link', { name: 'Already have an account? Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeVisible();
  });

  it('opens the sign-in page with a note after the account was created', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: Request) =>
        new URL(request.url).pathname === '/api/auth/register' ? json(202) : json(401, { message: 'Unauthorized' }),
      ),
    );
    renderPage('/register');
    await userEvent.type(await screen.findByLabelText('Email'), 'a@b.de');
    await userEvent.type(screen.getByLabelText('Password'), 'secret-password');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeVisible();
    expect(screen.getByText(/Account created/)).toBeVisible();
  });

  it.each([
    ['/c/42?tab=files', 'Chat page'],
    ['//evil.example', 'Start'],
    ['https://evil.example', 'Start'],
  ])('after signing in goes back to %s only when it is a page of this app', async (from, shown) => {
    let signedIn = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: Request) => {
        if (new URL(request.url).pathname === '/api/auth/login') {
          signedIn = true;
          return json(200, { id: 'u1', email: 'a@b.de' });
        }
        return signedIn ? json(200, { id: 'u1', email: 'a@b.de' }) : json(401, { message: 'Unauthorized' });
      }),
    );
    renderPage({ pathname: '/login', state: { from } });
    await userEvent.type(await screen.findByLabelText('Email'), 'a@b.de');
    await userEvent.type(screen.getByLabelText('Password'), 'secret-password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText(shown)).toBeVisible();
  });
});
