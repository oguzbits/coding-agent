import { ApiError, shouldRetry } from './client';

describe('shouldRetry', () => {
  it('does not retry answers of the server that will not change (4xx)', () => {
    expect(shouldRetry(0, new ApiError(404, 'Not Found'))).toBe(false);
    expect(shouldRetry(0, new ApiError(403, 'Forbidden'))).toBe(false);
  });

  it('retries server and network errors a couple of times', () => {
    expect(shouldRetry(0, new ApiError(503, 'Unavailable'))).toBe(true);
    expect(shouldRetry(0, new TypeError('Failed to fetch'))).toBe(true);
    expect(shouldRetry(2, new TypeError('Failed to fetch'))).toBe(false);
  });
});
