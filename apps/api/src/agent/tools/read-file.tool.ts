import { z } from 'zod';
import { ToolError, type AgentTool } from '../types.js';
import { numberLine, readTextFile, splitLines } from './file-access.js';
import type { Workspace } from './workspace.js';

export interface ReadLimits {
  readMaxLines: number;
  readMaxBytes: number;
}

const schema = z.strictObject({
  path: z.string().describe('File path relative to the project root'),
  offset: z.number().int().min(1).optional().describe('First line to read, counting from 1. Default 1.'),
  limit: z.number().int().min(1).optional().describe('Maximum number of lines to return.'),
});

/** Lines [start, start + maxLines) as numbered text, stopping early when the byte budget is used up. */
function pick(lines: string[], start: number, limits: ReadLimits, maxLines: number): string[] {
  const picked: string[] = [];
  let bytes = 0;
  for (let index = start - 1; index < lines.length && picked.length < maxLines; index += 1) {
    let text = numberLine(index + 1, lines[index]);
    if (picked.length > 0 && bytes + Buffer.byteLength(text) + 1 > limits.readMaxBytes) break;
    if (text.length > limits.readMaxBytes) text = `${text.slice(0, limits.readMaxBytes)} [line shortened]`;
    bytes += Buffer.byteLength(text) + 1;
    picked.push(text);
  }
  return picked;
}

export function createReadFileTool(
  workspace: Workspace,
  session: { readFiles: Set<string> },
  limits: ReadLimits,
): AgentTool<typeof schema> {
  return {
    name: 'read_file',
    description:
      'Reads a text file and returns numbered lines. Long files are returned in parts: use offset and limit to ' +
      'continue. A file must be read before it can be edited or replaced.',
    kind: 'read',
    schema,
    preview: async (args) => `Read ${args.path}`,
    async execute(args) {
      const { target, text } = await readTextFile(workspace, args.path);
      session.readFiles.add(target);
      const lines = splitLines(text);
      if (lines.length === 0) return `${args.path} is empty.`;
      const start = args.offset ?? 1;
      if (start > lines.length) {
        throw new ToolError(`Offset ${start} is past the end of the file (${lines.length} lines).`);
      }
      const picked = pick(lines, start, limits, Math.min(args.limit ?? limits.readMaxLines, limits.readMaxLines));
      const end = start + picked.length - 1;
      const notice =
        end < lines.length
          ? `\n[Showing lines ${start}-${end} of ${lines.length}. Continue with offset=${end + 1}.]`
          : '';
      return picked.join('\n') + notice;
    },
  };
}
