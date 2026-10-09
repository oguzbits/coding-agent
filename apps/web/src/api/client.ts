import createClient from 'openapi-fetch';
import type { components, paths } from './schema';

// Requests need an absolute URL; the fetch is looked up per call so tests can replace it.
export const api = createClient<paths>({
  baseUrl: globalThis.location.origin,
  fetch: (request) => globalThis.fetch(request),
});

export type Schemas = components['schemas'];

/** A failed API call with the message the server sent, ready to show to the user. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

interface Result<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

function messageOf(error: unknown, fallback: string): string {
  const message = (error as { message?: unknown } | undefined)?.message;
  if (Array.isArray(message)) return message.join(', ');
  return typeof message === 'string' ? message : fallback;
}

/** Returns the data of a response or throws an ApiError. Empty successful responses (204) give undefined. */
export async function unwrap<T>(request: Promise<Result<T>>): Promise<T> {
  const { data, error, response } = await request;
  if (!response.ok) throw new ApiError(response.status, messageOf(error, `Request failed (${response.status})`));
  return data as T;
}

/** Query retry policy: answers like 404 or 403 will not change, so only server and network failures are retried. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status < 500) return false;
  return failureCount < 2;
}
