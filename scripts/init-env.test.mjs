import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fillSecrets } from './init-env.mjs';

const example = 'DATABASE_URL=postgres://x\nSESSION_SECRET=\nMASTER_KEY=\n# MASTER_KEY=commented\nPORT=3000\n';

test('fills empty SESSION_SECRET and MASTER_KEY with random values', () => {
  const filled = fillSecrets(example);
  const values = Object.fromEntries(
    filled
      .split('\n')
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => line.split(/=(.*)/s).slice(0, 2)),
  );
  assert.ok(values.SESSION_SECRET.length >= 32);
  assert.equal(Buffer.from(values.MASTER_KEY, 'base64').length, 32);
  assert.equal(values.DATABASE_URL, 'postgres://x');
  assert.equal(values.PORT, '3000');
});

test('does not touch commented lines or values that are already set', () => {
  const filled = fillSecrets('SESSION_SECRET=keep-me\nMASTER_KEY=\n# MASTER_KEY=commented\n');
  assert.match(filled, /^SESSION_SECRET=keep-me$/m);
  assert.match(filled, /^# MASTER_KEY=commented$/m);
});

test('two runs produce different secrets', () => {
  assert.notEqual(fillSecrets(example), fillSecrets(example));
});
