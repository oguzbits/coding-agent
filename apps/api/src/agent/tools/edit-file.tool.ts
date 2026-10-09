import { writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { ToolError, type AgentTool } from '../types.js';
import { diffPreview, numberLine, readTextFile, splitLines } from './file-access.js';
import type { Workspace } from './workspace.js';

const CONTEXT_LINES = 2;
const SNIPPET_MAX_LINES = 30;

const schema = z.strictObject({
  path: z.string().describe('File path relative to the project root. The file must have been read first.'),
  old_string: z
    .string()
    .min(1)
    .describe('Exact text to replace, including whitespace. Must be unique unless replace_all.'),
  new_string: z.string().describe('Text to put in its place'),
  replace_all: z.boolean().optional().describe('Replace every occurrence instead of requiring a unique one'),
});

interface Change {
  target: string;
  before: string;
  after: string;
  count: number;
  firstIndex: number;
}

function applyEdit(before: string, args: z.infer<typeof schema>): Pick<Change, 'after' | 'count' | 'firstIndex'> {
  if (args.old_string === args.new_string) throw new ToolError('old_string and new_string are identical.');
  const firstIndex = before.indexOf(args.old_string);
  if (firstIndex === -1) {
    throw new ToolError(
      'old_string was not found in the file. Check the exact text, including whitespace, with read_file.',
    );
  }
  const count = before.split(args.old_string).length - 1;
  if (count > 1 && !args.replace_all) {
    throw new ToolError(
      `old_string appears ${count} times. Add more surrounding text to make it unique, or set replace_all.`,
    );
  }
  const after = args.replace_all
    ? before.split(args.old_string).join(args.new_string)
    : before.slice(0, firstIndex) + args.new_string + before.slice(firstIndex + args.old_string.length);
  return { after, count: args.replace_all ? count : 1, firstIndex };
}

/** The changed region of the new text with a little context, numbered like read_file. */
function snippet(change: Change, newString: string): string {
  const lines = splitLines(change.after);
  const firstLine = change.before.slice(0, change.firstIndex).split('\n').length;
  const changedLines = newString.split('\n').length;
  const from = Math.max(1, firstLine - CONTEXT_LINES);
  const to = Math.min(lines.length, firstLine + changedLines - 1 + CONTEXT_LINES, from + SNIPPET_MAX_LINES - 1);
  return lines
    .slice(from - 1, to)
    .map((text, index) => numberLine(from + index, text))
    .join('\n');
}

export function createEditFileTool(
  workspace: Workspace,
  session: { readFiles: Set<string> },
): AgentTool<typeof schema> {
  const prepare = async (args: z.infer<typeof schema>): Promise<Change> => {
    const { target, text } = await readTextFile(workspace, args.path);
    return { target, before: text, ...applyEdit(text, args) };
  };
  const ensureRead = async (args: z.infer<typeof schema>): Promise<Change> => {
    const change = await prepare(args);
    if (!session.readFiles.has(change.target)) {
      throw new ToolError(`Read ${args.path} with read_file first, then edit it.`);
    }
    return change;
  };
  return {
    name: 'edit_file',
    description:
      'Replaces text in an existing file. Read the file first. old_string must match exactly and be unique ' +
      '(or set replace_all). Returns the changed lines.',
    kind: 'edit',
    schema,
    targets: async (args) => [await workspace.realTarget(args.path)],
    precheck: async (args) => {
      await ensureRead(args);
    },
    preview: async (args) => {
      const change = await prepare(args);
      return diffPreview(args.path, change.before, change.after);
    },
    async execute(args) {
      const change = await ensureRead(args);
      await writeFile(change.target, change.after);
      const plural = change.count === 1 ? 'replacement' : 'replacements';
      return `Made ${change.count} ${plural} in ${args.path}:\n${snippet(change, args.new_string)}`;
    },
  };
}
