// Throwaway spike code. Question: does the API accept the schemas from z.toJSONSchema() for all six tools?
// Sends a trivial prompt with the tool declarations in three variants (as produced, without $schema, without
// $schema and additionalProperties) and records status and error text.
//   node --env-file=.env.local spikes/schema-probe.mjs [--model gemini-3.5-flash-lite]
import { mkdirSync, writeFileSync } from 'node:fs';
import { declarations } from './tools.mjs';
import { requestCount, streamWithRetry, summarizeResponse } from './gemini.mjs';

const argIndex = process.argv.indexOf('--model');
const model = argIndex > -1 ? process.argv[argIndex + 1] : 'gemini-3.5-flash-lite';
const here = (path) => new URL(path, import.meta.url);
mkdirSync(here('./results'), { recursive: true });

const report = [];
for (const variant of ['as-is', 'clean', 'minimal']) {
  const result = await streamWithRetry(model, {
    contents: [{ role: 'user', parts: [{ text: 'Reply with the single word OK. Do not call any tool.' }] }],
    tools: [{ functionDeclarations: declarations(variant) }],
  });
  const entry = { variant, status: result.status, ms: result.ms };
  if (result.status === 200) {
    const summary = summarizeResponse(result.chunks);
    entry.text = summary.parts.map((part) => part.text ?? '').join('').slice(0, 80);
    entry.usage = summary.usage;
  } else {
    entry.error = result.error;
  }
  report.push(entry);
  console.log(variant.padEnd(8), entry.status, entry.error?.message?.slice(0, 200) ?? entry.text);
}

writeFileSync(here('./results/schema-probe.json'), JSON.stringify({ model, report }, null, 2));
writeFileSync(here('./results/declarations.json'), JSON.stringify(declarations('clean'), null, 2));
console.log(`requests used: ${requestCount}`);
