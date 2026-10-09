import { readFile, stat } from 'node:fs/promises';
import type { Stats } from 'node:fs';
import { createTwoFilesPatch } from 'diff';
import { ToolError } from '../types.js';
import type { Workspace } from './workspace.js';

/** Files above this size are never read whole, whatever the per-call limits say. */
const MAX_FILE_BYTES = 5_000_000;
const PREVIEW_MAX_CHARS = 20_000;

export async function statOrUndefined(target: string): Promise<Stats | undefined> {
  try {
    return await stat(target);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return undefined;
    throw error;
  }
}

/** Reads a text file inside the workspace, failing with a message the model can act on. */
export async function readTextFile(workspace: Workspace, requested: string): Promise<{ target: string; text: string }> {
  const target = await workspace.resolve(requested);
  const info = await statOrUndefined(target);
  if (!info) throw new ToolError(`File not found: ${requested}`);
  if (!info.isFile()) throw new ToolError(`${requested} is not a file.`);
  if (info.size > MAX_FILE_BYTES) {
    throw new ToolError(
      `${requested} is too large to read (${info.size} bytes). Use search to find the part you need.`,
    );
  }
  const buffer = await readFile(target);
  if (buffer.includes(0)) throw new ToolError(`${requested} looks like a binary file and cannot be read as text.`);
  return { target, text: buffer.toString('utf8') };
}

export const numberLine = (lineNumber: number, text: string) => `${String(lineNumber).padStart(6)}\t${text}`;

/** Lines of a text without the empty piece after a final newline and without carriage returns. */
export function splitLines(text: string): string[] {
  const lines = text.split('\n').map((line) => line.replace(/\r$/, ''));
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

export function diffPreview(file: string, before: string, after: string): string {
  const patch = createTwoFilesPatch(file, file, before, after, '', '', { context: 3 });
  return patch.length > PREVIEW_MAX_CHARS ? `${patch.slice(0, PREVIEW_MAX_CHARS)}\n[diff shortened]` : patch;
}

export interface StorageLimit {
  /** Bytes the user may still store, counted over all projects. Leave out for no limit. */
  storageLeft?: (workspaceRoot: string) => Promise<number>;
}

/** Refuses a change that grows the user's stored data beyond what is left. Shrinking is always allowed. */
export async function assertRoomFor(growth: number, workspace: Workspace, limits: StorageLimit): Promise<void> {
  if (growth <= 0 || !limits.storageLeft) return;
  if (growth > (await limits.storageLeft(workspace.root))) {
    throw new ToolError('Your storage is full. Ask the user to delete a project or files to make room.');
  }
}
