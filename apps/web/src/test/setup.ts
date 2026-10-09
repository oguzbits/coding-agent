import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Newer Node versions ship their own `localStorage` global that is unusable without a backing file and hides jsdom's.
if (typeof globalThis.localStorage?.clear !== 'function') {
  const entries = new Map<string, string>();
  const memory: Storage = {
    get length() {
      return entries.size;
    },
    clear: () => entries.clear(),
    getItem: (key) => entries.get(key) ?? null,
    key: (index) => [...entries.keys()][index] ?? null,
    removeItem: (key) => void entries.delete(key),
    setItem: (key, value) => void entries.set(key, String(value)),
  };
  Object.defineProperty(globalThis, 'localStorage', { value: memory, configurable: true });
}

afterEach(() => {
  cleanup();
});
