import { ModePolicy, type PermissionMode } from './mode-policy.js';
import type { AgentTool, ToolKind } from './types.js';

const SELF_EXECUTING = ['package.json', '.github', '.husky', 'Makefile', '.npmrc'];

const tool = (kind: ToolKind, targets?: (args: { path: string }) => string[]): AgentTool =>
  ({ name: `${kind}_tool`, kind, targets }) as unknown as AgentTool;

const decide = (mode: PermissionMode, kind: ToolKind, path = 'src/a.ts') =>
  new ModePolicy(mode, SELF_EXECUTING).decide(
    tool(kind, (args) => [args.path]),
    { path },
  );

describe('ModePolicy', () => {
  it.each(['ask', 'auto_edit', 'plan'] as const)('lets read tools run in %s mode', (mode) => {
    expect(decide(mode, 'read')).toBe('allow');
  });

  it('asks for edits in ask mode, allows them in auto_edit and rejects them in plan', () => {
    expect(decide('ask', 'edit')).toBe('ask');
    expect(decide('auto_edit', 'edit')).toBe('allow');
    expect(decide('plan', 'edit')).toBe('reject');
  });

  it('asks for commands in ask and auto_edit and rejects them in plan', () => {
    expect(decide('ask', 'command')).toBe('ask');
    expect(decide('auto_edit', 'command')).toBe('ask');
    expect(decide('plan', 'command')).toBe('reject');
  });

  it.each([
    'package.json',
    'packages/web/package.json',
    '.github/workflows/ci.yml',
    '.husky/pre-commit',
    'Makefile',
    '.NPMRC',
  ])('still asks in auto_edit mode when the edit touches %s, which can run code later', (target) => {
    expect(decide('auto_edit', 'edit', target)).toBe('ask');
  });

  it('does not mistake similar names for self-executing files', () => {
    expect(decide('auto_edit', 'edit', 'docs/package.json.md')).toBe('allow');
    expect(decide('auto_edit', 'edit', 'my.github/x')).toBe('allow');
  });

  it('asks for an edit tool that does not say what it changes', () => {
    const policy = new ModePolicy('auto_edit', SELF_EXECUTING);
    expect(policy.decide(tool('edit'), {})).toBe('ask');
  });
});
