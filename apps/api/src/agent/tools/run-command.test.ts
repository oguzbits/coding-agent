import { mkdtemp, realpath, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ToolError } from '../types.js';
import { createRunCommandTool, type CommandLimits } from './run-command.tool.js';
import { Workspace } from './workspace.js';

const limits: CommandLimits = {
  commandDefaultTimeoutMs: 5000,
  commandMaxTimeoutMs: 10_000,
  commandOutputMaxChars: 400,
  commandKillGraceMs: 150,
};

describe('run_command', () => {
  let root: string;
  let tool: ReturnType<typeof createRunCommandTool>;
  const controller = () => new AbortController();
  const run = (args: { command: string; timeout_seconds?: number }, signal = controller().signal) =>
    tool.execute(tool.schema.parse(args), { signal });
  const alive = (pid: number) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };

  beforeEach(async () => {
    root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'cmd-')));
    tool = createRunCommandTool(new Workspace(root), limits, path.join(root, '.home'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('is a command tool and previews the command line', async () => {
    expect(tool.kind).toBe('command');
    expect(await tool.preview(tool.schema.parse({ command: 'npm test', timeout_seconds: 8 }))).toBe(
      '$ npm test\n(in the project folder, stops after 8 s)',
    );
  });

  it('returns the exit code and the combined output', async () => {
    expect(await run({ command: 'echo out; echo err 1>&2; exit 0' })).toMatch(/^Exit code: 0\n/);
    const failed = await run({ command: 'echo out; echo err 1>&2; exit 3' });
    expect(failed).toMatch(/^Exit code: 3\n/);
    expect(failed).toContain('out');
    expect(failed).toContain('err');
  });

  it('runs in the project folder', async () => {
    expect(await run({ command: 'pwd' })).toContain(root);
  });

  it('keeps the secrets of the server out of the command', async () => {
    process.env.SESSION_SECRET_PROBE = 'leaky-value';
    try {
      const output = await run({ command: 'env' });
      expect(output).not.toContain('leaky-value');
      expect(output).toMatch(/^Exit code: 0/);
      expect(output).toMatch(/PATH=/);
    } finally {
      delete process.env.SESSION_SECRET_PROBE;
    }
  });

  it('does not wait for input', async () => {
    expect(await run({ command: 'cat; echo done' })).toContain('done');
  });

  it('shortens long output keeping the start and the end, and says how much is missing', async () => {
    const output = await run({ command: 'seq 1 2000' });
    expect(output).toContain('\n1\n');
    expect(output).toMatch(/2000\s*$/);
    expect(output).toMatch(/\[\d+ lines omitted\]/);
    expect(output.length).toBeLessThan(limits.commandOutputMaxChars + 200);
  });

  it('stops a command that runs too long, with all its child processes', async () => {
    const started = Date.now();
    const output = await run({ command: 'sleep 30 & echo child=$!; wait', timeout_seconds: 1 });
    expect(Date.now() - started).toBeLessThan(5000);
    expect(output).toMatch(/timed out after 1 s/i);
    const pid = Number(/child=(\d+)/.exec(output)?.[1]);
    expect(pid).toBeGreaterThan(0);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(alive(pid)).toBe(false);
  });

  it('kills a command that ignores the polite stop', async () => {
    const output = await run({ command: `trap '' TERM; echo ready; while true; do sleep 1; done`, timeout_seconds: 1 });
    expect(output).toMatch(/timed out/i);
  });

  it('stops when the run is aborted, with the whole process group', async () => {
    const abort = controller();
    const pending = run({ command: 'sleep 30 & echo child=$!; wait' }, abort.signal);
    await new Promise((resolve) => setTimeout(resolve, 300));
    abort.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('does not start when the run was aborted already', async () => {
    const abort = controller();
    abort.abort();
    await expect(run({ command: 'echo hi' }, abort.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('limits the timeout the model can ask for', async () => {
    expect(() => tool.schema.parse({ command: 'x', timeout_seconds: 0 })).toThrow();
    await expect(run({ command: 'echo hi', timeout_seconds: 11 })).rejects.toBeInstanceOf(ToolError);
  });

  it('rejects an empty command before asking for approval', async () => {
    await expect(tool.precheck?.(tool.schema.parse({ command: '   ' }))).rejects.toBeInstanceOf(ToolError);
  });
});
