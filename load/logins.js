// Argon2id is deliberately expensive. While many logins run, are plain reads still answered quickly?
import { check, sleep } from 'k6';
import { api, login, signUp } from './lib.js';

// k6 clears cookies between iterations unless told otherwise; the session cookie must survive.
export const options = {
  noCookiesReset: true,
  scenarios: {
    // Needs one account for all logins; created in setup().
    login_storm: {
      executor: 'ramping-arrival-rate',
      startRate: 1,
      timeUnit: '1s',
      preAllocatedVUs: 20,
      maxVUs: 100,
      stages: [
        { target: Number(__ENV.LOGINS_PER_SECOND || 10), duration: '20s' },
        { target: Number(__ENV.LOGINS_PER_SECOND || 10), duration: '40s' },
      ],
      exec: 'storm',
    },
    reader: { executor: 'constant-vus', vus: 5, duration: '60s', exec: 'read' },
  },
};

export function setup() {
  return signUp('logins');
}

export function storm(account) {
  check(login(account), { 'login answered 200': (r) => r.status === 200 });
}

let signedIn = false;
export function read() {
  if (!signedIn) {
    signUp('reader');
    signedIn = true;
  }
  check(api('GET', '/api/projects', undefined, 'read projects'), { 'read answered 200': (r) => r.status === 200 });
  sleep(0.1);
}
