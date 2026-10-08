import type { AgentTool, PolicyDecision, ToolPolicy } from './types.js';

/** Fixed rules until the policy service with modes arrives (slice 6a): listed tools run, every other tool asks. */
export class StaticPolicy implements ToolPolicy {
  constructor(private readonly allowed: string[]) {}

  decide(tool: AgentTool): PolicyDecision {
    return this.allowed.includes(tool.name) ? 'allow' : 'ask';
  }
}
