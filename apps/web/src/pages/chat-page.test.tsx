import { screen } from '@testing-library/react';
import { json, renderAt, stubApi } from '../test/render';
import { ChatPage } from './chat-page';

describe('ChatPage', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'EventSource',
      class {
        addEventListener() {}
        close() {}
      },
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('says so when the conversation does not exist, with a way out', async () => {
    stubApi({ 'GET /api/conversations/abc': () => json(404, { message: 'Not Found' }) });
    renderAt('/c/abc', '/c/:id', <ChatPage />);
    expect(await screen.findByText(/conversation does not exist/i)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Start a new chat' })).toHaveAttribute('href', '/');
  });
});
