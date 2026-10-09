import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { ToolError, type AgentTool } from '../types.js';
import { diffPreview, readTextFile, statOrUndefined } from './file-access.js';
import type { Workspace } from './workspace.js';

export interface WriteLimits {
  writeMaxBytes: number;
}

const schema = z.strictObject({
  path: z.string().describe('File path relative to the project root. Missing folders are created.'),
  content: z.string().describe('The complete new content of the file'),
});

export function createWriteFileTool(
  workspace: Workspace,
  session: { readFiles: Set<string> },
  limits: WriteLimits,
): AgentTool<typeof schema> {
  /** Returns the resolved path and whether the file exists already. */
  const check = async (args: z.infer<typeof schema>) => {
    const size = Buffer.byteLength(args.content);
    if (size > limits.writeMaxBytes) {
      throw new ToolError(
        `The content is too large (${size} bytes, limit ${limits.writeMaxBytes}). Split it into several files.`,
      );
    }
    const target = await workspace.resolve(args.path);
    const info = await statOrUndefined(target);
    if (info && !info.isFile()) throw new ToolError(`${args.path} is not a file.`);
    if (info && !session.readFiles.has(target)) {
      throw new ToolError(`Read ${args.path} with read_file first, then replace it.`);
    }
    return { target, exists: info !== undefined };
  };
  return {
    name: 'write_file',
    description:
      'Creates a file with the given content, or replaces an existing one (which must have been read first). ' +
      'Prefer edit_file for small changes.',
    kind: 'edit',
    schema,
    targets: async (args) => [await workspace.realTarget(args.path)],
    precheck: async (args) => {
      await check(args);
    },
    preview: async (args) => {
      const target = await workspace.resolve(args.path);
      if (!(await statOrUndefined(target))) {
        return `New file: ${args.path}\n${diffPreview(args.path, '', args.content)}`;
      }
      return diffPreview(args.path, (await readTextFile(workspace, args.path)).text, args.content);
    },
    async execute(args) {
      const { target, exists } = await check(args);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, args.content);
      session.readFiles.add(target);
      return `${exists ? 'Replaced' : 'Created'} ${args.path} (${args.content.split('\n').length} lines).`;
    },
  };
}
