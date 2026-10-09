import type { AccountTokensService } from './account-tokens.service.js';
import { TokenCleanupService } from './token-cleanup.service.js';

describe('TokenCleanupService', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('cleans up once a day and stops when the module is destroyed', async () => {
    const deleteExpiredAndUsed = vi.fn().mockResolvedValue(0);
    const service = new TokenCleanupService({ deleteExpiredAndUsed } as unknown as AccountTokensService);
    service.onModuleInit();
    await vi.advanceTimersByTimeAsync(23 * 60 * 60 * 1000);
    expect(deleteExpiredAndUsed).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(deleteExpiredAndUsed).toHaveBeenCalledTimes(1);

    service.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(48 * 60 * 60 * 1000);
    expect(deleteExpiredAndUsed).toHaveBeenCalledTimes(1);
  });

  it('survives a failing cleanup', async () => {
    const service = new TokenCleanupService({
      deleteExpiredAndUsed: vi.fn().mockRejectedValue(new Error('db down')),
    } as unknown as AccountTokensService);
    await expect(service.run()).resolves.toBeUndefined();
  });
});
