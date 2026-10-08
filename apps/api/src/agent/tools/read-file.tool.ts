import { open } from 'node:fs/promises';
import { z } from 'zod';
import { ToolError, type AgentTool } from '../types.js';
import type { Workspace } from './workspace.js';

const schema = z.strictObject({ path: z.string().describe('File path relative to the workspace root') });

export function createReadFileTool(workspace: Workspace, options: { maxBytes: number }): AgentTool<typeof schema> {
  return {
    name: 'read_file',
    description: 'Reads a text file from the workspace and returns its content.',
    schema,
    preview: (args) => `Read ${args.path}`,
    async execute(args) {
      const target = await workspace.resolve(args.path);
      let handle;
      try {
        handle = await open(target, 'r');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new ToolError(`File not found: ${args.path}`);
        throw error;
      }
      try {
        const info = await handle.stat();
        if (!info.isFile()) throw new ToolError(`${args.path} is not a file.`);
        const buffer = Buffer.alloc(Math.min(info.size, options.maxBytes));
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
        const bytes = buffer.subarray(0, bytesRead);
        if (bytes.includes(0)) throw new ToolError(`${args.path} looks like a binary file and cannot be read as text.`);
        const text = bytes.toString('utf8');
        return info.size > options.maxBytes ? `${text}\n[file continues: ${info.size - bytesRead} more bytes]` : text;
      } finally {
        await handle.close();
      }
    },
  };
}
