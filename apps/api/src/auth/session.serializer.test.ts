import type { UsersService } from '../users/users.service.js';
import { SessionSerializer } from './session.serializer.js';

describe('SessionSerializer', () => {
  it('passes a failing user lookup on instead of crashing the process', async () => {
    const failure = new Error('connection refused');
    const users = { findById: vi.fn().mockRejectedValue(failure) } as unknown as UsersService;
    const done = vi.fn();
    await new SessionSerializer(users).deserializeUser('user-1', done);
    expect(done).toHaveBeenCalledWith(failure);
  });

  it('logs out a user that no longer exists', async () => {
    const users = { findById: vi.fn().mockResolvedValue(null) } as unknown as UsersService;
    const done = vi.fn();
    await new SessionSerializer(users).deserializeUser('user-1', done);
    expect(done).toHaveBeenCalledWith(null, false);
  });
});
