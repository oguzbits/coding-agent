import type { AgentTool } from '../types.js';
import { createEditFileTool } from './edit-file.tool.js';
import { createListFilesTool, type ListLimits } from './list-files.tool.js';
import { createReadFileTool, type ReadLimits } from './read-file.tool.js';
import { createSearchTool, type SearchLimits } from './search.tool.js';
import { createWriteFileTool, type WriteLimits } from './write-file.tool.js';
import type { Workspace } from './workspace.js';

export type ToolLimits = ReadLimits & ListLimits & SearchLimits & WriteLimits;

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
    createEditFileTool(workspace, session),
    createWriteFileTool(workspace, session, limits),
  ] as AgentTool[];
}
