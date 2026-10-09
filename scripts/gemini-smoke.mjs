// Live check of the Gemini adapter with a real key. Not part of any test run: it makes two small requests (free tier).
// Usage: build first (`npm run build`), then run it with GEMINI_API_KEY in the environment. The key is never printed.
import { validateEnv } from '../apps/api/dist/config/env.validation.js';
import { ModelError } from '../apps/api/dist/model/model-provider.js';
import { GeminiProvider } from '../apps/api/dist/model/gemini/gemini-provider.js';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('GEMINI_API_KEY is not set.');
  process.exit(1);
}
// Only to read the default model from the config module; the other values are placeholders.
const defaults = validateEnv({
  DATABASE_URL: 'postgres://unused',
  SESSION_SECRET: 'x'.repeat(32),
  MASTER_KEY: Buffer.alloc(32, 1).toString('base64'),
});
const model = process.env.GEMINI_MODEL ?? defaults.GEMINI_DEFAULT_MODEL;
const provider = new GeminiProvider();
const signal = AbortSignal.timeout(60_000);

const request = (text, tools = []) => ({
  model,
  apiKey,
  systemPrompt: 'You are a terse assistant.',
  history: [{ role: 'user', parts: [{ text }] }],
  tools,
});

function check(name, ok, detail) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
  if (!ok) process.exitCode = 1;
}

try {
  console.log(`model: ${model}`);
  const plain = await provider.generate(request('Reply with the single word: pong'), signal);
  check('plain answer', plain.text.trim().length > 0, `"${plain.text.trim().slice(0, 80)}"`);
  check('usage reported', plain.usage.promptTokens > 0 && plain.usage.outputTokens > 0, JSON.stringify(plain.usage));
  check('finish reason', plain.finishReason === 'STOP', plain.finishReason);

  const tool = {
    name: 'read_file',
    description: 'Reads a file of the project and returns its content.',
    parametersJsonSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Path relative to the project' } },
      required: ['path'],
    },
  };
  const withTool = await provider.generate(request('Show me the content of README.md using the tool.', [tool]), signal);
  const call = withTool.toolCalls[0];
  check('tool call', call?.name === 'read_file', call ? JSON.stringify(call.args) : 'no tool call');
  check('tool call has an id and parts to send back', Boolean(call?.id) && withTool.parts.length > 0);
} catch (error) {
  if (error instanceof ModelError) console.error(`FAIL model error (${error.kind}): ${error.message}`);
  else console.error(`FAIL ${error instanceof Error ? error.name : 'error'}`);
  process.exitCode = 1;
}
