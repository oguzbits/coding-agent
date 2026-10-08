import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkCommand } from './rules.mjs';

const project = '/work/coding-agent';
const check = (command, cwd = project) => checkCommand(command, { projectDir: project, cwd, home: '/home/dev' });
const blocked = (command, cwd) => assert.equal(check(command, cwd).allowed, false, `should block: ${command}`);
const allowed = (command, cwd) => assert.equal(check(command, cwd).allowed, true, `should allow: ${command}`);

test('allows ordinary commands', () => {
  allowed('git status');
  allowed('npm run check');
  allowed('git commit -m "feat: add thing"');
  allowed('git push origin main');
  allowed('ls -la src');
});

test('blocks force pushes in every spelling', () => {
  blocked('git push --force');
  blocked('git push -f origin main');
  blocked('git push origin main --force-with-lease');
  blocked('git push origin +main');
  blocked('git push -fu origin main');
  blocked('git status && git push --force-if-includes');
});

test('blocks skipping git hooks', () => {
  blocked('git commit --no-verify -m x');
  blocked('git push --no-verify');
  blocked('git commit -n -m x');
  blocked('git commit -nm x');
  allowed('git commit -am "name: not a flag"');
});

test('blocks recursive deletes outside the project', () => {
  blocked('rm -rf /');
  blocked('rm -rf ~');
  blocked('rm -rf ~/Documents');
  blocked('rm -r ../other');
  blocked('rm --recursive /tmp/x');
  blocked('rm -rf $HOME/x');
  blocked('cd /tmp && rm -rf build');
  blocked('rm -rf .');
  blocked('rm -rf ..');
});

test('allows recursive deletes inside the project', () => {
  allowed('rm -rf dist');
  allowed('rm -rf apps/api/dist coverage');
  allowed('rm -rf /work/coding-agent/node_modules');
  allowed('rm file.txt');
  allowed('rm -rf build', `${project}/apps/api`);
});

test('blocks env files and key files but not the example', () => {
  blocked('cat .env');
  blocked('cat .env.local');
  blocked('node --env-file=.env.local script.mjs');
  blocked('grep KEY apps/api/.env.production');
  blocked('cat ~/.ssh/id_ed25519');
  blocked('cp server.pem /tmp');
  blocked('cat certs/private.key');
  allowed('cat .env.example');
  allowed('cp .env.example docs/env-template.txt');
  blocked('cp .env.example .env.example.bak');
  allowed('echo environment');
  allowed('git log --oneline -- docs/dotenv.md');
});
