// Shared helpers for the k6 scenarios. k6 runs this in its own JavaScript runtime, not in Node.
import { check, fail, sleep } from 'k6';
import http from 'k6/http';

export const BASE_URL = __ENV.BASE_URL || 'http://host.docker.internal:3000';
export const METRICS_TOKEN = __ENV.METRICS_TOKEN || '';
const PASSWORD = 'load-test-password-123';

// The server only answers to its own host names; from a container the URL says host.docker.internal.
const headers = { Host: 'localhost:3000', 'Content-Type': 'application/json' };

/** One API call. `name` groups the timings of calls with changing URLs. */
export function api(method, path, body, name) {
  return http.request(method, `${BASE_URL}${path}`, body === undefined ? null : JSON.stringify(body), {
    headers,
    tags: { name: name || path },
  });
}

/** Creates an account for the current virtual user and logs in. The cookie stays in the VU's jar. */
export function signUp(prefix) {
  const email = `${prefix}-${__VU}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@load.test`;
  api('POST', '/api/auth/register', { email, password: PASSWORD }, 'register');
  const login = api('POST', '/api/auth/login', { email, password: PASSWORD }, 'login');
  if (!check(login, { 'login worked': (r) => r.status === 200 })) fail(`login failed with ${login.status}`);
  return { email, password: PASSWORD };
}

export function login(account) {
  return api('POST', '/api/auth/login', account, 'login');
}

export function newConversation(mode) {
  const project = api('POST', '/api/projects', { name: `load-${__VU}` }, 'create project').json();
  const conversation = api(
    'POST',
    '/api/conversations',
    { projectId: project.id, ...(mode ? { mode } : {}) },
    'create conversation',
  ).json();
  return { projectId: project.id, conversationId: conversation.id };
}

export function send(conversationId, text) {
  return api('POST', `/api/conversations/${conversationId}/messages`, { text }, 'send message');
}

/**
 * Polls until the run ends. Approves every action that asks, so scenarios with commands can run unattended.
 * Returns true when the run ended within the time.
 */
export function waitForRun(conversationId, maxSeconds) {
  const deadline = Date.now() + maxSeconds * 1000;
  while (Date.now() < deadline) {
    const run = api('GET', `/api/conversations/${conversationId}`, undefined, 'poll conversation').json('activeRun');
    if (!run) return true;
    if (run.pendingApproval) {
      api(
        'POST',
        `/api/conversations/${conversationId}/approvals`,
        { callId: run.pendingApproval.callId, approved: true },
        'approve',
      );
    }
    sleep(0.3);
  }
  return false;
}

export function scrapeMetrics() {
  return http.get(`${BASE_URL}/metrics`, {
    headers: { Host: 'localhost:3000', Authorization: `Bearer ${METRICS_TOKEN}` },
    tags: { name: 'metrics' },
  });
}
