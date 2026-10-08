import { readdir } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { ToolError, type AgentTool } from '../types.js';
import { statOrUndefined } from './file-access.js';
import type { Workspace } from './workspace.js';

export interface ListLimits {
  listMaxEntries: number;
  listDefaultDepth: number;
}

const MAX_DEPTH = 6;
/** Folders that are huge and rarely interesting: shown by name, never entered. */
const HEAVY_FOLDERS = new Set(['node_modules', 'dist', 'build', 'coverage', '.next', 'target', '__pycache__', '.venv']);

const schema = z.strictObject({
  path: z.string().optional().describe('Folder relative to the project root. Default: the project root.'),
  depth: z.number().int().min(1).max(MAX_DEPTH).optional().describe('How many folder levels to show.'),
});

interface Walk {
  workspace: Workspace;
  maxEntries: number;
  maxDepth: number;
  lines: string[];
}

function describe(entry: Dirent, shown: string): string {
  if (entry.isSymbolicLink()) return `${shown} (symlink)`;
  if (!entry.isDirectory()) return shown;
  return HEAVY_FOLDERS.has(entry.name) ? `${shown}/ (contents not listed)` : `${shown}/`;
}

/** Depth-first, sorted. Returns true when the entry limit cut the listing short. */
async function walk(state: Walk, directory: string, level: number): Promise<boolean> {
  const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : 1));
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    const shown = state.workspace.display(absolute);
    if (state.workspace.isProtected(shown)) continue;
    if (state.lines.length >= state.maxEntries) return true;
    state.lines.push(describe(entry, shown));
    const enter = entry.isDirectory() && !HEAVY_FOLDERS.has(entry.name) && level < state.maxDepth;
    if (enter && (await walk(state, absolute, level + 1))) return true;
  }
  return false;
}

export function createListFilesTool(workspace: Workspace, limits: ListLimits): AgentTool<typeof schema> {
  return {
    name: 'list_files',
    description:
      'Lists files and folders (folders end with a slash). Secrets and git internals are hidden. ' +
      'Use a subfolder path or a larger depth to see more.',
    kind: 'read',
    schema,
    preview: async (args) => `List ${args.path ?? '.'}`,
    async execute(args) {
      const requested = args.path ?? '.';
      const start = await workspace.resolve(requested);
      const info = await statOrUndefined(start);
      if (!info) throw new ToolError(`Folder not found: ${requested}`);
      if (!info.isDirectory()) throw new ToolError(`${requested} is not a folder.`);
      const state: Walk = {
        workspace,
        maxEntries: limits.listMaxEntries,
        maxDepth: args.depth ?? limits.listDefaultDepth,
        lines: [],
      };
      const truncated = await walk(state, start, 1);
      if (state.lines.length === 0) return '(empty folder)';
      const notice = truncated
        ? `\n[Listing truncated at ${limits.listMaxEntries} entries. List a subfolder or lower the depth.]`
        : '';
      return state.lines.join('\n') + notice;
    },
  };
}
