// Stop hook: when code changed, the turn may only end with a green `npm run check`. Exit code 2 sends the output back.
import { execFileSync, spawnSync } from 'node:child_process';
import { needsCheck } from './stop-rules.mjs';

let input = '';
for await (const chunk of process.stdin) input += chunk;
if (JSON.parse(input || '{}').stop_hook_active) process.exit(0);

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).split('\n').filter(Boolean);
const changed = [...git('diff', '--name-only', 'HEAD'), ...git('ls-files', '--others', '--exclude-standard')];
if (!needsCheck(changed) || !changed.some((file) => !file.startsWith('.claude/'))) process.exit(0);

const result = spawnSync('npm', ['run', 'check'], { encoding: 'utf8' });
if (result.status !== 0) {
  console.error(`npm run check is red, fix it before finishing:\n${(result.stdout + result.stderr).slice(-3000)}`);
  process.exit(2);
}
