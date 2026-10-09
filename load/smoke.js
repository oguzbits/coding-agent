// Smoke test: one pass through the main path. Fast; this is the one the CI runs.
import { check } from 'k6';
import http from 'k6/http';
import { BASE_URL, api, newConversation, scrapeMetrics, send, signUp, waitForRun } from './lib.js';

export const options = { vus: 1, iterations: 1 };

export default function () {
  check(http.get(`${BASE_URL}/api/health/live`, { headers: { Host: 'localhost:3000' } }), {
    'live answers 200': (r) => r.status === 200,
  });
  check(http.get(`${BASE_URL}/api/health/ready`, { headers: { Host: 'localhost:3000' } }), {
    'ready answers 200': (r) => r.status === 200,
  });
  signUp('smoke');
  check(api('GET', '/api/auth/me'), { 'me answers 200': (r) => r.status === 200 });
  const { conversationId } = newConversation();
  check(send(conversationId, 'hello'), { 'run accepted': (r) => r.status === 202 });
  check(waitForRun(conversationId, 30), { 'run ended': (ended) => ended });
  check(api('GET', '/api/projects'), { 'projects answer 200': (r) => r.status === 200 });
  if (__ENV.METRICS_TOKEN) check(scrapeMetrics(), { 'metrics answer 200': (r) => r.status === 200 });
}
