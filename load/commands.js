// Commands in process groups, with approval. COMMAND can be changed, e.g. to a command with huge output.
import { check } from 'k6';
import { newConversation, send, signUp, waitForRun } from './lib.js';

const COMMAND = __ENV.COMMAND || 'echo hello from the load test';

// k6 clears cookies between iterations unless told otherwise; the session cookie must survive.
export const options = {
  noCookiesReset: true,
  scenarios: {
    commands: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { target: Number(__ENV.VUS || 10), duration: '20s' },
        { target: Number(__ENV.VUS || 10), duration: '40s' },
        { target: 0, duration: '10s' },
      ],
    },
  },
};

let conversationId;
export default function () {
  if (!conversationId) {
    signUp('commands');
    conversationId = newConversation().conversationId;
  }
  check(send(conversationId, `run ${COMMAND}`), { 'run accepted': (r) => r.status === 202 });
  check(waitForRun(conversationId, 60), { 'run ended': (ended) => ended });
}
