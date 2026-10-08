import { AsyncLocalStorage } from 'node:async_hooks';

/** Ids that every log line of the current request (or run) carries. Later slices fill in the rest. */
export interface RequestContext {
  requestId: string;
  userId?: string;
  authSessionId?: string;
  runId?: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();
