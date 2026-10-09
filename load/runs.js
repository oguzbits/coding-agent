// Many runs at the same time, each with an open event stream, against the fake model with a delay per call.
import { check } from 'k6';
import http from 'k6/http';
import { BASE_URL, api, newConversation, send, signUp, waitForRun } from './lib.js';

const HOLD = Number(__ENV.SSE_HOLD_SECONDS || 5);

// k6 clears cookies between iterations unless told otherwise; the session cookie must survive.
export const options = {
  noCookiesReset: true,
  scenarios: {
    runs: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { target: Number(__ENV.VUS || 20), duration: '30s' },
        { target: Number(__ENV.VUS || 20), duration: '60s' },
        { target: 0, duration: '10s' },
      ],
    },
  },
};

let conversationId;
export default function () {
  if (!conversationId) {
    signUp('runs');
    conversationId = newConversation().conversationId;
  }
  check(send(conversationId, 'hello'), { 'run accepted': (r) => r.status === 202 });
  // k6 has no event-stream client. A request that is cut after HOLD seconds keeps the channel open that long;
  // the timeout it ends with is expected, so it is tagged and left out of the failure thresholds.
  http.get(`${BASE_URL}/api/conversations/${conversationId}/events`, {
    headers: { Host: 'localhost:3000', Accept: 'text/event-stream' },
    timeout: `${HOLD}s`,
    tags: { name: 'event stream', expected_timeout: 'true' },
  });
  check(waitForRun(conversationId, 60), { 'run ended': (ended) => ended });
  api('GET', '/api/conversations', undefined, 'list conversations');
}
