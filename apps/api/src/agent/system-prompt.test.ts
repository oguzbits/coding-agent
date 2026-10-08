import { SYSTEM_PROMPT, SYSTEM_PROMPT_VERSION } from './system-prompt.js';

describe('system prompt', () => {
  it('has a version and asks for few, focused tool calls', () => {
    expect(SYSTEM_PROMPT_VERSION).toMatch(/^\d+$/);
    expect(SYSTEM_PROMPT).toMatch(/few/i);
    expect(SYSTEM_PROMPT).toMatch(/approval|decline/i);
  });
});
