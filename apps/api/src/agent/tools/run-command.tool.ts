import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { z } from 'zod';
import { killGroup } from '../../process/process-group.js';
import { ToolError, type AgentTool } from '../types.js';
import { OutputCapture } from './output-capture.js';
import type { Workspace } from './workspace.js';

export interface CommandLimits {
  commandDefaultTimeoutMs: number;
  commandMaxTimeoutMs: number;
  commandOutputMaxChars: number;
  /** How long a command gets between the polite stop (SIGTERM) and the kill (SIGKILL). */
  commandKillGraceMs: number;
}

const COMMAND_MAX_CHARS = 10_000;

const schema = z.strictObject({
  command: z.string().max(COMMAND_MAX_CHARS).describe('Shell command, run in the project folder'),
  timeout_seconds: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      'Stop the command after this many seconds. Commands that never end (servers, watch mode) hit this limit.',
    ),
});

const abortError = () => new DOMException('The operation was aborted', 'AbortError');
const seconds = (ms: number) => Math.round(ms / 1000);

/** Nothing of the server's environment (keys, database access) reaches the command. */
const cleanEnv = (home: string): NodeJS.ProcessEnv => ({
  PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
  HOME: home,
  TERM: 'dumb',
  CI: '1',
  NO_COLOR: '1',
  GIT_TERMINAL_PROMPT: '0',
});

interface Finished {
  code: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  output: string;
}

function runInGroup(
  command: string,
  options: { cwd: string; home: string; timeoutMs: number; limits: CommandLimits; signal: AbortSignal },
): Promise<Finished> {
  return new Promise((resolve, reject) => {
    if (options.signal.aborted) return reject(abortError());
    const child = spawn('/bin/sh', ['-c', command], {
      cwd: options.cwd,
      env: cleanEnv(options.home),
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const capture = new OutputCapture(options.limits.commandOutputMaxChars);
    let timedOut = false;
    let killTimer: NodeJS.Timeout | undefined;
    const stop = () => {
      killGroup(child.pid, 'SIGTERM');
      killTimer ??= setTimeout(() => killGroup(child.pid, 'SIGKILL'), options.limits.commandKillGraceMs);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      stop();
    }, options.timeoutMs);
    options.signal.addEventListener('abort', stop, { once: true });

    for (const stream of [child.stdout, child.stderr]) {
      stream.setEncoding('utf8');
      stream.on('data', (chunk: string) => capture.push(chunk));
    }
    let exitTimer: NodeJS.Timeout | undefined;
    const finish = (code: number | null, signal: NodeJS.Signals | null) => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      clearTimeout(exitTimer);
      options.signal.removeEventListener('abort', stop);
      if (options.signal.aborted) return reject(abortError());
      resolve({ code, signal, timedOut, output: capture.result() });
    };
    child.on('exit', (code, signal) => {
      // Whatever the shell left behind (background jobs) is not allowed to outlive it.
      killGroup(child.pid, 'SIGKILL');
      // A process that left the group (setsid) may keep the pipes open for good; stop waiting for it.
      exitTimer = setTimeout(() => {
        child.stdout.destroy();
        child.stderr.destroy();
        finish(code, signal);
      }, options.limits.commandKillGraceMs);
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      clearTimeout(exitTimer);
      reject(error);
    });
    child.on('close', finish);
  });
}

function describeResult(result: Finished, timeoutMs: number): string {
  const status = result.signal ? `Terminated by signal ${result.signal}` : `Exit code: ${result.code}`;
  const timeout = result.timedOut
    ? `[Timed out after ${seconds(timeoutMs)} s; the command and its child processes were stopped.]\n`
    : '';
  return `${timeout}${status}\n${result.output}`.trimEnd();
}

export function createRunCommandTool(
  workspace: Workspace,
  limits: CommandLimits,
  home: string,
): AgentTool<typeof schema> {
  const timeoutOf = (args: z.infer<typeof schema>): number => {
    const ms = (args.timeout_seconds ?? seconds(limits.commandDefaultTimeoutMs)) * 1000;
    if (ms > limits.commandMaxTimeoutMs) {
      throw new ToolError(`timeout_seconds can be at most ${seconds(limits.commandMaxTimeoutMs)}.`);
    }
    return ms;
  };
  const validate = (args: z.infer<typeof schema>): number => {
    if (!args.command.trim()) throw new ToolError('The command is empty.');
    return timeoutOf(args);
  };
  return {
    name: 'run_command',
    description:
      'Runs a shell command in the project folder and returns its exit code and output (stdout and stderr together). ' +
      'There is no input and no terminal. Use it to run tests, builds and scripts. Long output is shortened in the middle.',
    kind: 'command',
    schema,
    precheck: async (args) => {
      validate(args);
    },
    preview: async (args) => `$ ${args.command}\n(in the project folder, stops after ${seconds(timeoutOf(args))} s)`,
    async execute(args, context) {
      const timeoutMs = validate(args);
      await mkdir(home, { recursive: true });
      const result = await runInGroup(args.command, {
        cwd: await workspace.resolve('.'),
        home,
        timeoutMs,
        limits,
        signal: context.signal,
      });
      return describeResult(result, timeoutMs);
    },
  };
}
