import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';

export function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Renders the element at the given path inside the providers the app uses. Other paths show their own name. */
export function renderAt(path: string, routePath: string, element: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={routePath} element={element} />
          <Route path="*" element={<p>Elsewhere</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Records the calls a page makes and answers them from a table of "METHOD /path" to responses. */
export function stubApi(answers: Record<string, () => Response>) {
  const calls: Array<{ key: string; body: unknown }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (request: Request) => {
      const key = `${request.method} ${new URL(request.url).pathname}`;
      const text = await request.text();
      calls.push({ key, body: text ? JSON.parse(text) : undefined });
      return (answers[key] ?? (() => json(404, { message: `unexpected ${key}` })))();
    }),
  );
  return calls;
}
