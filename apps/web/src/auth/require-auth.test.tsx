import { screen } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router';
import { json, renderAt, stubApi } from '../test/render';
import { RequireAuth } from './require-auth';

function LoginProbe() {
  const from = (useLocation().state as { from?: string } | null)?.from;
  return <p>from: {from}</p>;
}

describe('RequireAuth', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends anonymous visitors to /login and remembers the page they asked for', async () => {
    stubApi({ 'GET /api/auth/me': () => json(401, { message: 'Unauthorized' }) });
    renderAt(
      '/c/42?tab=files',
      '*',
      <Routes>
        <Route element={<RequireAuth />}>
          <Route path="/c/:id" element={<p>Chat</p>} />
        </Route>
        <Route path="/login" element={<LoginProbe />} />
      </Routes>,
    );
    expect(await screen.findByText('from: /c/42?tab=files')).toBeVisible();
  });
});
