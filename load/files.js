// File list and ZIP download of a project with many files. The files are created by the agent's own command tool.
import { check, sleep } from 'k6';
import { api, newConversation, send, signUp, waitForRun } from './lib.js';

const FILES = Number(__ENV.FILES || 300);
const KILOBYTES = Number(__ENV.KILOBYTES || 50);

// k6 clears cookies between iterations unless told otherwise; the session cookie must survive.
export const options = {
  noCookiesReset: true,
  scenarios: { files: { executor: 'constant-vus', vus: Number(__ENV.VUS || 5), duration: '60s' } },
};

let projectId;
export default function () {
  if (!projectId) {
    signUp('files');
    const created = newConversation();
    projectId = created.projectId;
    const make = `for i in $(seq 1 ${FILES}); do head -c ${KILOBYTES * 750} /dev/urandom | base64 > file$i.txt; done`;
    send(created.conversationId, `run ${make}`);
    waitForRun(created.conversationId, 120);
  }
  check(api('GET', `/api/projects/${projectId}/files`, undefined, 'list files'), {
    'list answered 200': (r) => r.status === 200,
  });
  check(api('GET', `/api/projects/${projectId}/download`, undefined, 'download zip'), {
    'zip answered 200': (r) => r.status === 200,
  });
  sleep(0.5);
}
