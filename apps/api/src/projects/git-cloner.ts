import { execFile, spawn } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { killGroup } from '../process/process-group.js';
import { directorySize } from './disk-usage.js';

export type CloneErrorCode = 'invalid_url' | 'failed' | 'timeout' | 'too_large' | 'unavailable';

export class CloneError extends Error {
  constructor(
    readonly code: CloneErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface CloneLimits {
  timeoutMs: number;
  maxBytes: number;
  killGraceMs: number;
  /** Oldest acceptable git version (the one with the fixes for CVE-2024-32002 and CVE-2025-48384). */
  minVersion: string;
}

const URL_MAX_CHARS = 500;
const SIZE_POLL_MS = 100;
const STDERR_KEEP_CHARS = 2000;
const invalidUrl = (message: string) => new CloneError('invalid_url', message);
const abortError = () => new DOMException('The operation was aborted', 'AbortError');

export function parseGitVersion(output: string): string | undefined {
  return /git version (\d+(?:\.\d+)*)/.exec(output)?.[1];
}

export function compareVersions(a: string, b: string): number {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/** Clones public repositories safely: shallow, https only, no hooks, no submodules, no LFS, with time and size limits. */
export class GitCloner {
  constructor(private readonly options: { gitBinary: string; home: string; limits: CloneLimits }) {}

  static parseUrl(raw: string): string {
    const text = raw.trim();
    if (!text || text.length > URL_MAX_CHARS || /\s/.test(text)) throw invalidUrl('The URL is not valid.');
    if (!/^https:\/\/[^/]/i.test(text)) throw invalidUrl('Only https URLs can be cloned.');
    let url: URL;
    try {
      url = new URL(text);
    } catch {
      throw invalidUrl('The URL is not valid.');
    }
    if (url.username || url.password) throw invalidUrl('The URL must not contain a user name or password.');
    if (!url.hostname || url.pathname.length <= 1) throw invalidUrl('The URL must point to a repository.');
    return url.href;
  }

  /** Whether git is installed and new enough. Checked at startup; cloning is switched off when it is not. */
  check(): Promise<{ ok: boolean; version?: string }> {
    return new Promise((resolve) => {
      execFile(this.options.gitBinary, ['--version'], { timeout: 5000 }, (error, stdout) => {
        const version = error ? undefined : parseGitVersion(stdout);
        resolve({
          ok: version !== undefined && compareVersions(version, this.options.limits.minVersion) >= 0,
          ...(version ? { version } : {}),
        });
      });
    });
  }

  async clone(
    rawUrl: string,
    target: string,
    signal: AbortSignal,
    override: { maxBytes?: number } = {},
  ): Promise<void> {
    const url = GitCloner.parseUrl(rawUrl);
    const maxBytes = Math.min(this.options.limits.maxBytes, override.maxBytes ?? Number.POSITIVE_INFINITY);
    await mkdir(this.options.home, { recursive: true });
    try {
      await this.run(url, target, signal, maxBytes);
    } catch (error) {
      await rm(target, { recursive: true, force: true });
      throw error;
    }
  }

  private args(url: string, target: string): string[] {
    return [
      '-c',
      'protocol.allow=never',
      '-c',
      'protocol.https.allow=always',
      '-c',
      'filter.lfs.smudge=',
      '-c',
      'filter.lfs.process=',
      '-c',
      'filter.lfs.required=false',
      'clone',
      '--depth',
      '1',
      '--no-recurse-submodules',
      '--single-branch',
      '--template=',
      '--',
      url,
      target,
    ];
  }

  private env(): NodeJS.ProcessEnv {
    return {
      PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
      HOME: this.options.home,
      LC_ALL: 'C',
      GIT_TERMINAL_PROMPT: '0',
      GIT_LFS_SKIP_SMUDGE: '1',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_ALLOW_PROTOCOL: 'https',
    };
  }

  private run(url: string, target: string, signal: AbortSignal, maxBytes: number): Promise<void> {
    const { limits } = this.options;
    return new Promise((resolve, reject) => {
      if (signal.aborted) return reject(abortError());
      const child = spawn(this.options.gitBinary, this.args(url, target), {
        env: this.env(),
        detached: true,
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      let failure: CloneError | undefined;
      let killTimer: NodeJS.Timeout | undefined;
      let stderr = '';
      const stop = (reason?: CloneError) => {
        failure ??= reason;
        killGroup(child.pid, 'SIGTERM');
        killTimer ??= setTimeout(() => killGroup(child.pid, 'SIGKILL'), limits.killGraceMs);
      };
      const tooLarge = () => new CloneError('too_large', 'The repository is too large for the storage that is left.');
      const timeout = setTimeout(
        () =>
          stop(
            new CloneError(
              'timeout',
              `The clone took longer than ${Math.round(limits.timeoutMs / 1000)} s and was stopped.`,
            ),
          ),
        limits.timeoutMs,
      );
      const poll = setInterval(() => {
        void directorySize(target).then(
          (size) => size > maxBytes && stop(tooLarge()),
          () => undefined,
        );
      }, SIZE_POLL_MS);
      const onAbort = () => stop();
      signal.addEventListener('abort', onAbort, { once: true });
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk: string) => {
        stderr = (stderr + chunk).slice(-STDERR_KEEP_CHARS);
      });
      child.on('exit', () => killGroup(child.pid, 'SIGKILL'));
      const cleanUp = () => {
        clearTimeout(timeout);
        clearTimeout(killTimer);
        clearInterval(poll);
        signal.removeEventListener('abort', onAbort);
      };
      child.on('error', () => {
        cleanUp();
        reject(new CloneError('unavailable', 'Git could not be started.'));
      });
      child.on('close', (code) => {
        cleanUp();
        if (signal.aborted) return reject(abortError());
        if (failure) return reject(failure);
        if (code !== 0)
          return reject(new CloneError('failed', `Git could not clone the repository: ${lastLine(stderr)}`));
        directorySize(target).then((size) => (size > maxBytes ? reject(tooLarge()) : resolve()), reject);
      });
    });
  }
}

const lastLine = (text: string): string => text.trim().split('\n').at(-1)?.slice(0, 200) || 'unknown error';
