import { BLOCKED_PLACEHOLDER, useRunBlockedByEmail } from '../api/queries';

/** The composer is off while busy, and also while the server would refuse runs for an unconfirmed address. */
export function useComposerGate(busy: boolean): { disabled: boolean; placeholder?: string } {
  const blocked = useRunBlockedByEmail();
  return { disabled: busy || blocked, ...(blocked ? { placeholder: BLOCKED_PLACEHOLDER } : {}) };
}
