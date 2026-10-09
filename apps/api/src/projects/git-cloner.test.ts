import { chmod, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { directorySize } from './disk-usage.js';
import { CloneError, GitCloner, compareVersions, parseGitVersion } from './git-cloner.js';

const limits = { timeoutMs: 1500, maxBytes: 100_000, killGraceMs: 100, minVersion: '2.50.1' };

describe('GitCloner', () => {
  let dir: string;
  let argsFile: string;
  const signal = () => new AbortController().signal;

  /** A stand-in for the git program. `body` is shell code; the last argument is the target folder. */
  async function fakeGit(body: string): Promise<GitCloner> {
    const script = path.join(dir, 'git');
    await writeFile(
      script,
      `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "git version 2.51.0"; exit 0; fi\n` +
        `for last; do :; done\nTARGET="$last"\nprintf '%s\\n' "$@" > "${argsFile}"\n${body}\n`,
    );
    await chmod(script, 0o755);
    return new GitCloner({ gitBinary: script, home: path.join(dir, 'home'), limits });
  }

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'clone-'));
    argsFile = path.join(dir, 'args.txt');
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  describe('parseUrl', () => {
    it('accepts plain https URLs', () => {
      expect(GitCloner.parseUrl('https://github.com/octocat/Hello-World.git')).toBe(
        'https://github.com/octocat/Hello-World.git',
      );
      expect(GitCloner.parseUrl('  https://example.org/a/b  ')).toBe('https://example.org/a/b');
    });

    it.each([
      'http://github.com/a/b',
      'git://github.com/a/b',
      'ssh://git@github.com/a/b',
      'git@github.com:a/b.git',
      'file:///etc/passwd',
      '/local/path',
      '--upload-pack=touch /tmp/x',
      'https://user:token@github.com/a/b',
      'https://github.com',
      'https:///a/b',
      `https://example.org/${'a'.repeat(600)}`,
      'https://exa mple.org/a',
    ])('rejects %s', (url) => {
      expect(() => GitCloner.parseUrl(url)).toThrow(CloneError);
    });
  });

  describe('versions', () => {
    it('reads the version from git output', () => {
      expect(parseGitVersion('git version 2.51.0')).toBe('2.51.0');
      expect(parseGitVersion('git version 2.39.5 (Apple Git-154)')).toBe('2.39.5');
      expect(parseGitVersion('nonsense')).toBeUndefined();
    });

    it('compares versions numerically', () => {
      expect(compareVersions('2.50.1', '2.50.1')).toBe(0);
      expect(compareVersions('2.9.0', '2.50.1')).toBeLessThan(0);
      expect(compareVersions('2.51.0', '2.50.1')).toBeGreaterThan(0);
      expect(compareVersions('3.0', '2.50.1')).toBeGreaterThan(0);
    });

    it('reports whether the installed git is new enough', async () => {
      expect(await (await fakeGit('exit 0')).check()).toEqual({ ok: true, version: '2.51.0' });
      const old = new GitCloner({
        gitBinary: path.join(dir, 'git'),
        home: dir,
        limits: { ...limits, minVersion: '2.60.0' },
      });
      expect(await old.check()).toMatchObject({ ok: false, version: '2.51.0' });
      const missing = new GitCloner({ gitBinary: path.join(dir, 'nope'), home: dir, limits });
      expect(await missing.check()).toMatchObject({ ok: false });
    });
  });

  describe('clone', () => {
    it('runs a shallow https clone without submodules, hooks, prompts or lfs', async () => {
      const cloner = await fakeGit(`mkdir -p "$TARGET" && echo hi > "$TARGET/file.txt"`);
      const target = path.join(dir, 'project');
      await cloner.clone('https://github.com/a/b.git', target, signal());
      const args = (await readFile(argsFile, 'utf8')).split('\n');
      expect(args).toEqual(
        expect.arrayContaining(['clone', '--depth', '1', '--no-recurse-submodules', '--single-branch', '--template=']),
      );
      expect(args).toContain('protocol.allow=never');
      expect(args).toContain('protocol.https.allow=always');
      expect(args.slice(-4, -2)).toEqual(['--', 'https://github.com/a/b.git']);
      expect(await readFile(path.join(target, 'file.txt'), 'utf8')).toBe('hi\n');
    });

    it('does not give git the secrets of the server or a terminal to ask on', async () => {
      process.env.CLONE_PROBE_SECRET = 'leaky-value';
      try {
        const cloner = await fakeGit(`env > "${dir}/env.txt"; mkdir -p "$TARGET"`);
        await cloner.clone('https://github.com/a/b', path.join(dir, 'p'), signal());
        const env = await readFile(path.join(dir, 'env.txt'), 'utf8');
        expect(env).not.toContain('leaky-value');
        expect(env).toContain('GIT_TERMINAL_PROMPT=0');
        expect(env).toContain('GIT_LFS_SKIP_SMUDGE=1');
      } finally {
        delete process.env.CLONE_PROBE_SECRET;
      }
    });

    it('reports a failing git with its last line and leaves nothing behind', async () => {
      const cloner = await fakeGit(
        `mkdir -p "$TARGET"; echo partial > "$TARGET/x"; echo "fatal: repository not found" >&2; exit 128`,
      );
      const target = path.join(dir, 'project');
      await expect(cloner.clone('https://github.com/a/b', target, signal())).rejects.toMatchObject({
        code: 'failed',
        message: expect.stringContaining('repository not found'),
      });
      await expect(readdir(target)).rejects.toThrow();
    });

    it('stops a clone that takes too long', async () => {
      const cloner = await fakeGit(`mkdir -p "$TARGET"; sleep 30`);
      const target = path.join(dir, 'project');
      const started = Date.now();
      await expect(cloner.clone('https://github.com/a/b', target, signal())).rejects.toMatchObject({ code: 'timeout' });
      expect(Date.now() - started).toBeLessThan(5000);
      await expect(readdir(target)).rejects.toThrow();
    });

    it('stops a clone that grows past the size limit', async () => {
      const cloner = await fakeGit(
        `mkdir -p "$TARGET"; i=0; while [ $i -lt 100 ]; do head -c 20000 /dev/zero > "$TARGET/f$i"; i=$((i+1)); sleep 0.05; done`,
      );
      const target = path.join(dir, 'project');
      await expect(cloner.clone('https://github.com/a/b', target, signal())).rejects.toMatchObject({
        code: 'too_large',
      });
      await expect(readdir(target)).rejects.toThrow();
    });

    it('applies a smaller size limit when little storage is left', async () => {
      const cloner = await fakeGit(`mkdir -p "$TARGET"; head -c 5000 /dev/zero > "$TARGET/f"`);
      await expect(
        cloner.clone('https://github.com/a/b', path.join(dir, 'project'), signal(), { maxBytes: 1000 }),
      ).rejects.toMatchObject({ code: 'too_large' });
    });

    it('stops on abort and cleans up', async () => {
      const cloner = await fakeGit(`mkdir -p "$TARGET"; sleep 30`);
      const abort = new AbortController();
      const target = path.join(dir, 'project');
      const pending = cloner.clone('https://github.com/a/b', target, abort.signal);
      setTimeout(() => abort.abort(), 200);
      await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      await expect(readdir(target)).rejects.toThrow();
    });

    it('refuses a bad URL before starting git', async () => {
      const cloner = await fakeGit('exit 0');
      await expect(cloner.clone('http://x.org/a', path.join(dir, 'p'), signal())).rejects.toMatchObject({
        code: 'invalid_url',
      });
      await expect(readFile(argsFile, 'utf8')).rejects.toThrow();
    });
  });
});

describe('directorySize', () => {
  it('adds up file sizes in nested folders and ignores a missing folder', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'size-'));
    try {
      await writeFile(path.join(dir, 'a'), 'x'.repeat(10));
      await import('node:fs/promises').then((fs) => fs.mkdir(path.join(dir, 'sub')));
      await writeFile(path.join(dir, 'sub', 'b'), 'y'.repeat(5));
      expect(await directorySize(dir)).toBe(15);
      expect(await directorySize(path.join(dir, 'missing'))).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
