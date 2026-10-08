import { ApprovalRegistry } from './approval-registry.js';

describe('ApprovalRegistry', () => {
  it('resolves a waiting request with the decision', async () => {
    const registry = new ApprovalRegistry();
    const pending = registry.request('c1', new AbortController().signal);
    expect(registry.resolve('c1', true)).toBe(true);
    await expect(pending).resolves.toBe(true);
    expect(registry.hasPending('c1')).toBe(false);
  });

  it('knows nothing about unknown or already answered calls', async () => {
    const registry = new ApprovalRegistry();
    expect(registry.resolve('nope', true)).toBe(false);
    const pending = registry.request('c1', new AbortController().signal);
    registry.resolve('c1', false);
    await pending;
    expect(registry.resolve('c1', true)).toBe(false);
  });

  it('rejects with an AbortError when the run is aborted while waiting', async () => {
    const registry = new ApprovalRegistry();
    const controller = new AbortController();
    const pending = registry.request('c1', controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(registry.hasPending('c1')).toBe(false);
  });

  it('rejects immediately when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(new ApprovalRegistry().request('c1', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
});
