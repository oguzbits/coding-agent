import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ToolError } from '../types.js';
import { createAppendNoteTool } from './append-note.tool.js';
import { createReadFileTool } from './read-file.tool.js';
import { Workspace } from './workspace.js';

const context = { signal: new AbortController().signal };

describe('workspace tools', () => {
  let root: string;
  let workspace: Workspace;

  beforeEach(async () => {
    root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'tools-')));
    await mkdir(path.join(root, 'src'));
    await writeFile(path.join(root, 'src', 'a.txt'), 'line1\nline2\nline3\n');
    await writeFile(path.join(root, '.env'), 'SECRET=1');
    workspace = new Workspace(root);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  describe('read_file', () => {
    it('returns the file content', async () => {
      const tool = createReadFileTool(workspace, { maxBytes: 1000 });
      expect(await tool.execute({ path: 'src/a.txt' }, context)).toBe('line1\nline2\nline3\n');
    });

    it('tells the model when the file does not exist', async () => {
      const tool = createReadFileTool(workspace, { maxBytes: 1000 });
      await expect(tool.execute({ path: 'src/missing.txt' }, context)).rejects.toThrow(/not found/i);
    });

    it('refuses directories', async () => {
      const tool = createReadFileTool(workspace, { maxBytes: 1000 });
      await expect(tool.execute({ path: 'src' }, context)).rejects.toThrow(/not a file/i);
    });

    it('refuses protected files without revealing content', async () => {
      const tool = createReadFileTool(workspace, { maxBytes: 1000 });
      const error = await tool.execute({ path: '.env' }, context).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ToolError);
      expect((error as Error).message).not.toContain('SECRET');
    });

    it('reads only the first maxBytes and says so', async () => {
      const tool = createReadFileTool(workspace, { maxBytes: 8 });
      const output = await tool.execute({ path: 'src/a.txt' }, context);
      expect(output.startsWith('line1\nli')).toBe(true);
      expect(output).toMatch(/file continues/i);
    });

    it('refuses binary files', async () => {
      await writeFile(path.join(root, 'bin.dat'), Buffer.from([1, 2, 0, 3]));
      const tool = createReadFileTool(workspace, { maxBytes: 1000 });
      await expect(tool.execute({ path: 'bin.dat' }, context)).rejects.toThrow(/binary/i);
    });

    it('validates its arguments', () => {
      const tool = createReadFileTool(workspace, { maxBytes: 1000 });
      expect(tool.schema.safeParse({}).success).toBe(false);
      expect(tool.schema.safeParse({ path: 'a', extra: 1 }).success).toBe(false);
    });
  });

  describe('append_note', () => {
    it('appends a line to NOTES.md inside the workspace and previews it', async () => {
      const tool = createAppendNoteTool(workspace);
      expect(tool.preview({ text: 'remember this' })).toContain('remember this');
      await tool.execute({ text: 'first' }, context);
      await tool.execute({ text: 'second' }, context);
      expect(await readFile(path.join(root, 'NOTES.md'), 'utf8')).toBe('first\nsecond\n');
    });
  });
});
