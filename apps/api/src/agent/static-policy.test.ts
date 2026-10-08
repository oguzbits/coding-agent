import { z } from 'zod';
import { StaticPolicy } from './static-policy.js';
import type { AgentTool } from './types.js';

const tool = (name: string): AgentTool => ({
  name,
  description: '',
  schema: z.object({}),
  preview: () => '',
  execute: async () => '',
});

describe('StaticPolicy', () => {
  it('lets reading tools run and asks before anything else', () => {
    const policy = new StaticPolicy(['read_file']);
    expect(policy.decide(tool('read_file'))).toBe('allow');
    expect(policy.decide(tool('append_note'))).toBe('ask');
    expect(policy.decide(tool('unknown_tool'))).toBe('ask');
  });
});
