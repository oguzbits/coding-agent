// PreToolUse hook for Bash: reads the tool call as JSON on stdin, exit code 2 blocks it and shows the reason to the model.
import { homedir } from 'node:os';
import { checkCommand } from './rules.mjs';

let input = '';
for await (const chunk of process.stdin) input += chunk;

const event = JSON.parse(input);
const command = event.tool_input?.command ?? '';
const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const result = checkCommand(command, { projectDir, cwd: event.cwd ?? projectDir, home: homedir() });

if (!result.allowed) {
  console.error(`Blocked by .claude/hooks/rules.mjs: ${result.reason}`);
  process.exit(2);
}
