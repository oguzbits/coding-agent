import path from 'node:path';
import type { AgentTool } from '../types.js';
import type { StorageLimit } from './file-access.js';
import { createEditFileTool } from './edit-file.tool.js';
import { createListFilesTool, type ListLimits } from './list-files.tool.js';
import { createReadFileTool, type ReadLimits } from './read-file.tool.js';
import { createRunCommandTool, type CommandLimits } from './run-command.tool.js';
import { createSearchTool, type SearchLimits } from './search.tool.js';
import { createWriteFileTool, type WriteLimits } from './write-file.tool.js';
import type { Workspace } from './workspace.js';

export type ToolLimits = StorageLimit & ReadLimits & ListLimits & SearchLimits & WriteLimits & CommandLimits;

/** What the tools remember within one conversation. */
export interface ToolSession {
  /** Absolute paths of files the model has read or written. Changing a file needs it to be in here. */
  readFiles: Set<string>;
}

export function createWorkspaceTools(workspace: Workspace, session: ToolSession, limits: ToolLimits): AgentTool[] {
  return [
    createReadFileTool(workspace, session, limits),
    createListFilesTool(workspace, limits),
    createSearchTool(workspace, limits),
    createEditFileTool(workspace, session, limits),
    createWriteFileTool(workspace, session, limits),
    // Commands get a home folder next to the projects of the user, so tools like npm do not touch the server's own.
    createRunCommandTool(workspace, limits, path.join(path.dirname(workspace.root), '.home')),
  ] as AgentTool[];
}
