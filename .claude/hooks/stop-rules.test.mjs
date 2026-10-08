import { test } from 'node:test';
import assert from 'node:assert/strict';
import { needsCheck } from './stop-rules.mjs';

test('code and config changes need a green check', () => {
  assert.equal(needsCheck(['apps/api/src/main.ts']), true);
  assert.equal(needsCheck(['package.json']), true);
  assert.equal(needsCheck(['.claude/hooks/rules.mjs']), true);
  assert.equal(needsCheck(['docs/PLAN.md', 'apps/web/src/App.tsx']), true);
});

test('docs, notes and spikes alone do not', () => {
  assert.equal(needsCheck([]), false);
  assert.equal(needsCheck(['docs/PLAN.md', 'README.md', 'spikes/tools.mjs']), false);
});
