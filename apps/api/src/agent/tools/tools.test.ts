import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { rgPath } from '@vscode/ripgrep';
import { ToolError, type AgentTool } from '../types.js';
import { createWorkspaceTools, type ToolLimits, type ToolSession } from './create-tools.js';
import { Workspace } from './workspace.js';

const context = { signal: new AbortController().signal };
const limits: ToolLimits = {
  readMaxLines: 5,
  readMaxBytes: 1000,
  listMaxEntries: 8,
  listDefaultDepth: 2,
  searchMaxMatches: 3,
  searchLineMaxChars: 40,
  searchTimeoutMs: 5000,
  writeMaxBytes: 200,
  commandDefaultTimeoutMs: 5000,
  commandMaxTimeoutMs: 10_000,
  commandOutputMaxChars: 400,
  commandKillGraceMs: 150,
  rgPath,
};

describe('workspace tools', () => {
  let root: string;
  let workspace: Workspace;
  let session: ToolSession;
  let tools: Record<string, AgentTool>;
  const run = (name: string, args: object) => tools[name].execute(tools[name].schema.parse(args), context);
  const preview = (name: string, args: object) => tools[name].preview(tools[name].schema.parse(args));
  const precheck = (name: string, args: object) => tools[name].precheck?.(tools[name].schema.parse(args));
  const put = async (relative: string, content: string) => {
    await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
    await writeFile(path.join(root, relative), content);
  };

  beforeEach(async () => {
    root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'tools-')));
    workspace = new Workspace(root);
    session = { readFiles: new Set() };
    tools = Object.fromEntries(createWorkspaceTools(workspace, session, limits).map((tool) => [tool.name, tool]));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('offers the six tools with the right kinds', () => {
    expect(Object.keys(tools)).toEqual(['read_file', 'list_files', 'search', 'edit_file', 'write_file', 'run_command']);
    expect(Object.values(tools).map((tool) => tool.kind)).toEqual(['read', 'read', 'read', 'edit', 'edit', 'command']);
  });

  describe('read_file', () => {
    it('returns numbered lines', async () => {
      await put('a.txt', 'one\ntwo\nthree\n');
      expect(await run('read_file', { path: 'a.txt' })).toBe('     1\tone\n     2\ttwo\n     3\tthree');
    });

    it('reads a window with offset and limit and says how to continue', async () => {
      await put('a.txt', 'one\ntwo\nthree\nfour\n');
      const output = await run('read_file', { path: 'a.txt', offset: 2, limit: 2 });
      expect(output).toContain('     2\ttwo\n     3\tthree');
      expect(output).not.toContain('four');
      expect(output).toMatch(/offset=4/);
    });

    it('cuts at the line limit and points to the next offset', async () => {
      await put('long.txt', Array.from({ length: 12 }, (_, i) => `l${i + 1}`).join('\n'));
      const output = await run('read_file', { path: 'long.txt' });
      expect(output).toContain('     5\tl5');
      expect(output).not.toContain('l6');
      expect(output).toMatch(/offset=6/);
    });

    it('cuts at the byte limit', async () => {
      await put('wide.txt', `${'x'.repeat(400)}\n${'y'.repeat(400)}\n${'z'.repeat(400)}\n`);
      const output = await run('read_file', { path: 'wide.txt' });
      expect(output).not.toContain('z');
      expect(output).toMatch(/offset=3/);
    });

    it('handles empty files and offsets past the end', async () => {
      await put('empty.txt', '');
      await put('a.txt', 'one\n');
      expect(await run('read_file', { path: 'empty.txt' })).toMatch(/empty/i);
      await expect(run('read_file', { path: 'a.txt', offset: 9 })).rejects.toThrow(/past the end/i);
    });

    it('tells the model when the file is missing, a directory, binary or protected', async () => {
      await put('sub/x.txt', 'x');
      await writeFile(path.join(root, 'bin.dat'), Buffer.from([1, 2, 0, 3]));
      await put(`.${'env'}`, 'SECRET=hunter2');
      await expect(run('read_file', { path: 'nope.txt' })).rejects.toThrow(/not found/i);
      await expect(run('read_file', { path: 'sub' })).rejects.toThrow(/not a file/i);
      await expect(run('read_file', { path: 'bin.dat' })).rejects.toThrow(/binary/i);
      const error = await run('read_file', { path: `.${'env'}` }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ToolError);
      expect((error as Error).message).not.toContain('hunter2');
    });

    it('remembers which files were read', async () => {
      await put('a.txt', 'one');
      await run('read_file', { path: 'a.txt' });
      expect(session.readFiles.has(path.join(root, 'a.txt'))).toBe(true);
    });

    it('validates its arguments', () => {
      expect(tools.read_file.schema.safeParse({}).success).toBe(false);
      expect(tools.read_file.schema.safeParse({ path: 'a', offset: 0 }).success).toBe(false);
      expect(tools.read_file.schema.safeParse({ path: 'a', extra: 1 }).success).toBe(false);
    });
  });

  describe('list_files', () => {
    beforeEach(async () => {
      await put('src/a.ts', '');
      await put('src/deep/b.ts', '');
      await put('src/deep/deeper/c.ts', '');
      await put('README.md', '');
      await put('.git/config', '');
      await put(`.${'env'}`, 'x');
      await put(`.${'env'}.example`, 'x');
      await put('node_modules/pkg/index.js', '');
    });

    it('lists relative paths with a slash after folders, to the default depth', async () => {
      const lines = (await run('list_files', {})).split('\n');
      expect(lines).toContain('src/');
      expect(lines).toContain('src/a.ts');
      expect(lines).toContain('src/deep/');
      expect(lines).not.toContain('src/deep/b.ts');
      expect(lines).toContain('README.md');
    });

    it('goes deeper on request and starts in a subfolder', async () => {
      expect(await run('list_files', { depth: 3 })).toContain('src/deep/b.ts');
      expect(await run('list_files', { path: 'src', depth: 3 })).toContain('src/deep/deeper/c.ts');
      const lines = (await run('list_files', { path: 'src/deep', depth: 1 })).split('\n');
      expect(lines).toContain('src/deep/b.ts');
      expect(lines).not.toContain('src/a.ts');
    });

    it('hides protected names but shows the example file', async () => {
      const output = await run('list_files', {});
      expect(output).not.toMatch(/\.git\b/);
      expect(output).not.toMatch(/^\.env$/m);
      expect(output).toContain(`.${'env'}.example`);
    });

    it('shows heavy folders by name only', async () => {
      const output = await run('list_files', {});
      expect(output).toMatch(/node_modules\/ \(contents not listed\)/);
      expect(output).not.toContain('index.js');
    });

    it('stops at the entry limit and says how to see more', async () => {
      for (let i = 0; i < 12; i += 1) await put(`many/f${String(i).padStart(2, '0')}.txt`, '');
      const output = await run('list_files', { path: 'many' });
      expect(output.split('\n').filter((line) => line.endsWith('.txt'))).toHaveLength(limits.listMaxEntries);
      expect(output).toMatch(/truncated.*subfolder/i);
    });

    it('does not follow symlinks out of the workspace', async () => {
      const outside = await mkdtemp(path.join(os.tmpdir(), 'outside-'));
      await writeFile(path.join(outside, 'secret.txt'), 'x');
      await symlink(outside, path.join(root, 'link'));
      const output = await run('list_files', { depth: 2 });
      expect(output).toContain('link (symlink)');
      expect(output).not.toContain('secret.txt');
      await rm(outside, { recursive: true, force: true });
    });

    it('rejects files and missing folders', async () => {
      await expect(run('list_files', { path: 'README.md' })).rejects.toThrow(/not a folder/i);
      await expect(run('list_files', { path: 'nope' })).rejects.toThrow(/not found/i);
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      await put('src/a.ts', 'const needle = 1;\nconst other = 2;\n');
      await put('src/b.ts', 'needle again\n');
      await put('notes.md', 'a needle in markdown\n');
      await put(`.${'env'}`, 'needle=secret\n');
      await put('.git/config', 'needle\n');
      await put('src/long.ts', `needle ${'x'.repeat(200)}\n`);
    });

    it('finds matches as path:line: text', async () => {
      const output = await run('search', { pattern: 'other' });
      expect(output).toBe('src/a.ts:2: const other = 2;');
    });

    it('never returns protected files', async () => {
      const output = await run('search', { pattern: 'needle', glob: '*' });
      expect(output).not.toContain('secret');
      expect(output).not.toContain('.git');
    });

    it('limits matches and shortens long lines', async () => {
      const output = await run('search', { pattern: 'needle' });
      expect(output.split('\n').filter((line) => /^\S+:\d+:/.test(line))).toHaveLength(limits.searchMaxMatches);
      expect(output).toMatch(/stopped at 3 matches/i);
      expect(Math.max(...output.split('\n').map((line) => line.length))).toBeLessThan(120);
    });

    it('narrows by path and glob', async () => {
      expect(await run('search', { pattern: 'needle', path: 'src', glob: 'b.*' })).toBe('src/b.ts:1: needle again');
    });

    it('says so when nothing matches', async () => {
      expect(await run('search', { pattern: 'zzz-not-there' })).toMatch(/no matches/i);
    });

    it('reports an invalid pattern as an error for the model', async () => {
      await expect(run('search', { pattern: '(' })).rejects.toThrow(/regular expression/i);
    });

    it('treats a pattern that looks like a flag as a pattern', async () => {
      await put('flag.txt', '--files is here\n');
      expect(await run('search', { pattern: '--files' })).toContain('flag.txt:1:');
    });

    it('keeps the search inside the workspace', async () => {
      await expect(run('search', { pattern: 'x', path: '../' })).rejects.toThrow(/outside the workspace/i);
    });
  });

  describe('edit_file', () => {
    beforeEach(async () => {
      await put('a.txt', 'alpha\nbeta\ngamma\nbeta\n');
    });

    it('only changes files that were read in the conversation', async () => {
      await expect(precheck('edit_file', { path: 'a.txt', old_string: 'alpha', new_string: 'A' })).rejects.toThrow(
        /read .*a\.txt.* first/i,
      );
    });

    it('replaces a unique piece and shows the changed lines', async () => {
      await run('read_file', { path: 'a.txt' });
      const output = await run('edit_file', { path: 'a.txt', old_string: 'alpha', new_string: 'ALPHA' });
      expect(output).toMatch(/1 replacement/);
      expect(output).toContain('ALPHA');
      expect(await readFile(path.join(root, 'a.txt'), 'utf8')).toBe('ALPHA\nbeta\ngamma\nbeta\n');
    });

    it('refuses a piece that is not unique, unless replace_all is set', async () => {
      await run('read_file', { path: 'a.txt' });
      await expect(run('edit_file', { path: 'a.txt', old_string: 'beta', new_string: 'B' })).rejects.toThrow(
        /2 times.*replace_all/i,
      );
      expect(await run('edit_file', { path: 'a.txt', old_string: 'beta', new_string: 'B', replace_all: true })).toMatch(
        /2 replacements/,
      );
      expect(await readFile(path.join(root, 'a.txt'), 'utf8')).toBe('alpha\nB\ngamma\nB\n');
    });

    it('explains a missing piece and identical strings', async () => {
      await run('read_file', { path: 'a.txt' });
      await expect(run('edit_file', { path: 'a.txt', old_string: 'zeta', new_string: 'Z' })).rejects.toThrow(
        /not found/i,
      );
      await expect(run('edit_file', { path: 'a.txt', old_string: 'beta', new_string: 'beta' })).rejects.toThrow(
        /identical/i,
      );
    });

    it('treats dollar signs in the new text literally', async () => {
      await run('read_file', { path: 'a.txt' });
      await run('edit_file', { path: 'a.txt', old_string: 'alpha', new_string: "$& $1 $'" });
      expect((await readFile(path.join(root, 'a.txt'), 'utf8')).split('\n')[0]).toBe("$& $1 $'");
    });

    it('previews the change as a diff and lists its target', async () => {
      await run('read_file', { path: 'a.txt' });
      const diff = await preview('edit_file', { path: 'a.txt', old_string: 'alpha', new_string: 'ALPHA' });
      expect(diff).toContain('-alpha');
      expect(diff).toContain('+ALPHA');
      expect(await tools.edit_file.targets?.({ path: 'a.txt', old_string: 'x', new_string: 'y' } as never)).toEqual([
        'a.txt',
      ]);
    });

    it('refuses protected and outside paths', async () => {
      await expect(run('edit_file', { path: `.${'env'}`, old_string: 'a', new_string: 'b' })).rejects.toThrow(
        /protected/i,
      );
      await expect(run('edit_file', { path: '../x', old_string: 'a', new_string: 'b' })).rejects.toThrow(/outside/i);
    });
  });

  describe('targets of edits', () => {
    it.each([
      ['edit_file', { path: 'notes.md', old_string: 'a', new_string: 'b' }],
      ['write_file', { path: 'notes.md', content: 'c' }],
    ])('%s names the real file behind a symlink', async (name, input) => {
      await put('package.json', '{}');
      await symlink(path.join(root, 'package.json'), path.join(root, 'notes.md'));
      expect(await tools[name].targets?.(tools[name].schema.parse(input))).toEqual(['package.json']);
    });

    it('refuses a symlink to a protected file', async () => {
      await put('.env', 'SECRET=1');
      await symlink(path.join(root, '.env'), path.join(root, 'notes.md'));
      await expect(
        tools.write_file.precheck?.(tools.write_file.schema.parse({ path: 'notes.md', content: 'x' })),
      ).rejects.toThrow(/protected/i);
    });
  });

  describe('storage of the user', () => {
    const withRoom = (bytes: number) => {
      const small = createWorkspaceTools(workspace, session, { ...limits, storageLeft: async () => bytes });
      return Object.fromEntries(small.map((tool) => [tool.name, tool]));
    };

    it('refuses a write that does not fit into what is left', async () => {
      const limited = withRoom(5);
      const args = limited.write_file.schema.parse({ path: 'a.txt', content: 'x'.repeat(6) });
      await expect(limited.write_file.precheck?.(args)).rejects.toThrow(/storage/i);
      const fits = limited.write_file.schema.parse({ path: 'a.txt', content: 'x'.repeat(5) });
      await expect(limited.write_file.precheck?.(fits)).resolves.toBeUndefined();
    });

    it('only counts the growth when a file is replaced or edited', async () => {
      await put('a.txt', `MARK${'x'.repeat(6)}`);
      await run('read_file', { path: 'a.txt' });
      const limited = withRoom(2);
      const replace = limited.write_file.schema.parse({ path: 'a.txt', content: 'y'.repeat(12) });
      await expect(limited.write_file.precheck?.(replace)).resolves.toBeUndefined();
      const tooMuch = limited.write_file.schema.parse({ path: 'a.txt', content: 'y'.repeat(13) });
      await expect(limited.write_file.precheck?.(tooMuch)).rejects.toThrow(/storage/i);

      const grow = limited.edit_file.schema.parse({ path: 'a.txt', old_string: 'MARK', new_string: 'M'.repeat(8) });
      await expect(limited.edit_file.precheck?.(grow)).rejects.toThrow(/storage/i);
      const shrink = limited.edit_file.schema.parse({ path: 'a.txt', old_string: 'MARKxxxx', new_string: 'z' });
      await expect(limited.edit_file.precheck?.(shrink)).resolves.toBeUndefined();
    });
  });

  describe('write_file', () => {
    it('creates a file and missing folders, and counts it as read', async () => {
      const output = await run('write_file', { path: 'new/dir/x.txt', content: 'hello\n' });
      expect(output).toMatch(/created/i);
      expect(await readFile(path.join(root, 'new/dir/x.txt'), 'utf8')).toBe('hello\n');
      expect(session.readFiles.has(path.join(root, 'new/dir/x.txt'))).toBe(true);
    });

    it('replaces an existing file only after it was read', async () => {
      await put('a.txt', 'old');
      await expect(precheck('write_file', { path: 'a.txt', content: 'new' })).rejects.toThrow(/read .* first/i);
      await run('read_file', { path: 'a.txt' });
      expect(await run('write_file', { path: 'a.txt', content: 'new' })).toMatch(/replaced/i);
      expect(await readFile(path.join(root, 'a.txt'), 'utf8')).toBe('new');
    });

    it('refuses content above the limit and directories', async () => {
      await expect(precheck('write_file', { path: 'big.txt', content: 'x'.repeat(201) })).rejects.toThrow(/too large/i);
      await put('dir/x.txt', '');
      await expect(run('write_file', { path: 'dir', content: 'x' })).rejects.toThrow(/not a file/i);
    });

    it('previews a new file and a replacement', async () => {
      expect(await preview('write_file', { path: 'new.txt', content: 'line\n' })).toMatch(/new file[\s\S]*\+line/i);
      await put('a.txt', 'old\n');
      await run('read_file', { path: 'a.txt' });
      const diff = await preview('write_file', { path: 'a.txt', content: 'new\n' });
      expect(diff).toContain('-old');
      expect(diff).toContain('+new');
    });

    it('refuses protected and outside paths', async () => {
      await expect(run('write_file', { path: `.${'env'}`, content: 'x' })).rejects.toThrow(/protected/i);
      await expect(run('write_file', { path: '../x', content: 'x' })).rejects.toThrow(/outside/i);
      await expect(run('write_file', { path: '.git/hooks/pre-commit', content: 'x' })).rejects.toThrow(/protected/i);
    });
  });
});
