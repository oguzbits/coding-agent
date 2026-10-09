import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ToolError } from '../types.js';
import { Workspace } from './workspace.js';

describe('Workspace', () => {
  let root: string;
  let outside: string;
  let workspace: Workspace;

  beforeEach(async () => {
    const base = await realpath(await mkdtemp(path.join(os.tmpdir(), 'ws-')));
    root = path.join(base, 'root');
    outside = path.join(base, 'outside');
    await mkdir(path.join(root, 'src'), { recursive: true });
    await mkdir(path.join(root, '.git'));
    await mkdir(outside);
    await writeFile(path.join(root, 'src', 'a.txt'), 'hello');
    await writeFile(path.join(outside, 'secret.txt'), 'nope');
    workspace = new Workspace(root);
  });

  afterEach(async () => {
    await rm(path.dirname(root), { recursive: true, force: true });
  });

  it('resolves relative paths inside the workspace', async () => {
    expect(await workspace.resolve('src/a.txt')).toBe(path.join(root, 'src', 'a.txt'));
    expect(await workspace.resolve('./src/../src/a.txt')).toBe(path.join(root, 'src', 'a.txt'));
  });

  it('allows paths that do not exist yet when the parent is inside', async () => {
    expect(await workspace.resolve('src/new.txt')).toBe(path.join(root, 'src', 'new.txt'));
  });

  it('rejects absolute paths and parent traversal', async () => {
    await expect(workspace.resolve(path.join(outside, 'secret.txt'))).rejects.toBeInstanceOf(ToolError);
    await expect(workspace.resolve('../outside/secret.txt')).rejects.toBeInstanceOf(ToolError);
    await expect(workspace.resolve('src/../../outside/secret.txt')).rejects.toBeInstanceOf(ToolError);
  });

  it('rejects a symlink that points outside the workspace', async () => {
    await symlink(outside, path.join(root, 'link'));
    await expect(workspace.resolve('link/secret.txt')).rejects.toThrow(/outside the workspace/i);
  });

  it('rejects a symlinked file that points outside the workspace', async () => {
    await symlink(path.join(outside, 'secret.txt'), path.join(root, 'src', 'file-link'));
    await expect(workspace.resolve('src/file-link')).rejects.toThrow(/outside the workspace/i);
  });

  it('names the file a symlink points to when asked for the real target', async () => {
    await writeFile(path.join(root, 'package.json'), '{}');
    await symlink(path.join(root, 'package.json'), path.join(root, 'src', 'notes.md'));
    expect(await workspace.realTarget('src/notes.md')).toBe('package.json');
    expect(await workspace.realTarget('src/new.md')).toBe('src/new.md');
    await expect(workspace.realTarget('src/file-link-missing/../../..')).rejects.toBeInstanceOf(ToolError);
  });

  it('rejects empty paths and NUL bytes', async () => {
    await expect(workspace.resolve('')).rejects.toBeInstanceOf(ToolError);
    await expect(workspace.resolve('src/a.txt\0.png')).rejects.toBeInstanceOf(ToolError);
  });

  it.each([
    '.env',
    '.env.local',
    'src/.ENV',
    '.git/config',
    'src/.git/HEAD',
    '.GIT/config',
    'certs/server.pem',
    'certs/private.KEY',
    'id_rsa',
    'home/id_ed25519.pub',
  ])('blocks protected path %s', async (candidate) => {
    await expect(workspace.resolve(candidate)).rejects.toThrow(/protected/i);
  });

  it('allows .env.example', async () => {
    expect(await workspace.resolve('.env.example')).toBe(path.join(root, '.env.example'));
  });

  it('treats a unicode-decomposed name like the composed one', async () => {
    await expect(workspace.resolve('.énv')).resolves.toBeTruthy();
    await expect(workspace.resolve('café/.env')).rejects.toThrow(/protected/i);
  });

  it('tells whether a relative path is protected, without touching the disk', () => {
    expect(workspace.isProtected('.env')).toBe(true);
    expect(workspace.isProtected('src/.Git/config')).toBe(true);
    expect(workspace.isProtected('keys/server.PEM')).toBe(true);
    expect(workspace.isProtected('.env.example')).toBe(false);
    expect(workspace.isProtected('src/a.txt')).toBe(false);
  });

  it('makes paths relative for display', async () => {
    expect(workspace.display(path.join(root, 'src', 'a.txt'))).toBe('src/a.txt');
  });
});
