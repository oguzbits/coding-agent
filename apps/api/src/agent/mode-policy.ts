import { posix } from 'node:path';
import type { AgentTool, PolicyDecision, ToolPolicy } from './types.js';

export const PERMISSION_MODES = ['ask', 'auto_edit', 'plan'] as const;
export type PermissionMode = (typeof PERMISSION_MODES)[number];

/**
 * What each mode lets the agent do on its own:
 * - ask: reads run, everything else asks
 * - auto_edit: file edits run too, except in files that can run code later (package.json, CI, hooks)
 * - plan: reads only, changes and commands are refused
 */
export class ModePolicy implements ToolPolicy {
  private readonly selfExecuting: string[];

  constructor(
    private readonly mode: PermissionMode,
    selfExecuting: string[],
  ) {
    this.selfExecuting = selfExecuting.map((entry) => entry.toLowerCase());
  }

  decide(tool: AgentTool, args: unknown): PolicyDecision {
    if (tool.kind === 'read') return 'allow';
    if (this.mode === 'plan') return 'reject';
    if (tool.kind === 'edit' && this.mode === 'auto_edit' && !this.touchesSelfExecuting(tool, args)) return 'allow';
    return 'ask';
  }

  /** True when the edit may touch a file that runs code later, or when we cannot tell what it touches. */
  private touchesSelfExecuting(tool: AgentTool, args: unknown): boolean {
    if (!tool.targets) return true;
    return tool.targets(args).some((target) => this.isSelfExecuting(target));
  }

  private isSelfExecuting(target: string): boolean {
    const normalized = posix.normalize(target.replaceAll('\\', '/')).toLowerCase();
    return this.selfExecuting.some(
      (entry) =>
        normalized === entry ||
        normalized.startsWith(`${entry}/`) ||
        normalized.endsWith(`/${entry}`) ||
        normalized.includes(`/${entry}/`),
    );
  }
}
