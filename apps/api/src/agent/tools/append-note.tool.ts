import { appendFile } from 'node:fs/promises';
import { z } from 'zod';
import type { AgentTool } from '../types.js';
import type { Workspace } from './workspace.js';

const schema = z.strictObject({ text: z.string().min(1).max(2000).describe('One line to add to NOTES.md') });

/** Stand-in for a tool that changes the workspace: it needs approval, so the whole flow can be tested end to end. */
export function createAppendNoteTool(workspace: Workspace): AgentTool<typeof schema> {
  return {
    name: 'append_note',
    description: 'Appends one line to NOTES.md in the workspace. Needs the user to approve.',
    schema,
    preview: (args) => `Append to NOTES.md: ${args.text}`,
    async execute(args) {
      await appendFile(await workspace.resolve('NOTES.md'), `${args.text}\n`);
      return 'Added the note to NOTES.md.';
    },
  };
}
