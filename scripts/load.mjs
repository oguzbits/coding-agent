// Runs a k6 scenario from load/ in the official k6 image, so nothing has to be installed. The server must already
// run (npm run load:server). Usage: npm run load -- <scenario> [k6 args]
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const [scenario, ...rest] = process.argv.slice(2);
const root = path.resolve(import.meta.dirname, '..');
if (!scenario || !existsSync(path.join(root, 'load', `${scenario}.js`))) {
  console.error('Usage: npm run load -- <smoke|logins|runs|commands|files> [k6 args]');
  process.exit(2);
}

const env = [
  'BASE_URL',
  'METRICS_TOKEN',
  'VUS',
  'LOGINS_PER_SECOND',
  'SSE_HOLD_SECONDS',
  'COMMAND',
  'FILES',
  'KILOBYTES',
]
  .filter((name) => process.env[name] !== undefined)
  .flatMap((name) => ['-e', `${name}=${process.env[name]}`]);
const result = spawnSync(
  'docker',
  [
    'run',
    '--rm',
    '-i',
    '-v',
    `${root}/load:/load:ro`,
    ...env,
    'grafana/k6',
    'run',
    '--quiet',
    ...rest,
    `/load/${scenario}.js`,
  ],
  { stdio: 'inherit' },
);
process.exit(result.status ?? 1);
