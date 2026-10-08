// Throwaway spike code. Question: does Flash-Lite solve a small real task with function calling, and at what cost?
// Task: the tests of a tiny project fail; the agent must find the cause, fix the source and run the tests.
// Records per request: stream shape, thought signatures, parallel calls, tokens, time, 429 bodies. Raw SSE is kept.
//   node --env-file=.env.local spikes/agent-probe.mjs [--model gemini-3.5-flash-lite] [--runs 3] [--max-steps 25]
import { cpSync, createReadStream, mkdirSync, readFileSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { declarations, executeTool } from './tools.mjs';
import { DailyQuotaError, requestCount, streamWithRetry, summarizeResponse } from './gemini.mjs';

const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? process.argv[index + 1] : fallback;
};
const model = arg('model', 'gemini-3.5-flash-lite');
const runs = Number(arg('runs', 3));
const maxSteps = Number(arg('max-steps', 25));
const here = (path) => new URL(path, import.meta.url).pathname;

const SYSTEM =
  'You are a coding agent working in a project directory. Use the tools to inspect and change files. ' +
  'Prefer few, targeted calls: search or list before you read, read before you edit, and run the tests after ' +
  'your change. When the task is done, stop and summarise what you changed in two sentences.';
const TASK = 'The tests fail. Find the cause and fix it in the source code. Do not change the tests.';

const tools = [{ functionDeclarations: declarations('clean') }];
const sha = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

mkdirSync(here('./results/raw'), { recursive: true });
const limitLog = (entry) => appendFileSync(here('./results/limits.jsonl'), `${JSON.stringify(entry)}\n`);

async function runOnce(runNumber) {
  const root = here(`./work/run-${runNumber}`);
  rmSync(root, { recursive: true, force: true });
  cpSync(here('./fixture'), root, { recursive: true });
  const testHash = sha(`${root}/test/cart.test.mjs`);
  const ctx = { root, readFiles: new Set() };

  const history = [{ role: 'user', parts: [{ text: TASK }] }];
  const steps = [];
  const startedAt = Date.now();
  let outcome = 'max-steps';
  let finalText = '';

  for (let step = 1; step <= maxSteps; step += 1) {
    const result = await streamWithRetry(
      model,
      { systemInstruction: { parts: [{ text: SYSTEM }] }, contents: history, tools },
      (entry) => limitLog({ run: runNumber, step, ...entry })
    );
    writeFileSync(here(`./results/raw/run-${runNumber}-step-${step}.${result.status === 200 ? 'sse' : 'error.json'}`), result.rawText);
    if (result.status !== 200) {
      outcome = `http-${result.status}: ${result.error?.message?.slice(0, 300)}`;
      steps.push({ step, status: result.status, ms: result.ms, error: result.error });
      break;
    }

    const summary = summarizeResponse(result.chunks);
    const calls = summary.parts.filter((part) => part.functionCall);
    const record = {
      step,
      status: 200,
      attempts: result.attempts,
      ms: result.ms,
      firstChunkMs: result.chunks[0]?.tMs,
      chunks: result.chunks.length,
      chunksWithCalls: summary.chunksWithCalls,
      finishReason: summary.finishReason,
      usage: summary.usage,
      partKinds: summary.parts.map((part) =>
        part.functionCall ? 'call' : part.thought ? 'thought' : 'text' in part ? (part.text === '' ? 'empty-text' : 'text') : 'other'
      ),
      calls: calls.map((part) => part.functionCall.name),
      callKeys: [...new Set(calls.flatMap((part) => Object.keys(part.functionCall)))],
      signatureOnCalls: calls.map((part) => Boolean(part.thoughtSignature)),
      signatureOnOtherParts: summary.parts.filter((part) => !part.functionCall && part.thoughtSignature).length,
    };

    // The model's parts go back unchanged, exactly as plan.md demands.
    history.push({ role: 'model', parts: summary.parts });

    if (calls.length === 0) {
      finalText = summary.parts.filter((part) => !part.thought).map((part) => part.text ?? '').join('');
      outcome = summary.finishReason === 'STOP' ? 'finished' : `ended-${summary.finishReason}`;
      steps.push(record);
      break;
    }

    const responses = calls.map((part) => {
      const { name, args } = part.functionCall;
      const outcomeOfTool = executeTool(name, args, ctx);
      record.toolResults = [...(record.toolResults ?? []), { name, ok: outcomeOfTool.ok }];
      return {
        functionResponse: { name, response: outcomeOfTool.ok ? { output: outcomeOfTool.output } : { error: outcomeOfTool.output } },
      };
    });
    history.push({ role: 'user', parts: responses });
    steps.push(record);
  }

  const tests = spawnSync('npm', ['test'], { cwd: root, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: root } });
  const sum = (key) => steps.reduce((total, s) => total + (s.usage?.[key] ?? 0), 0);
  const summary = {
    run: runNumber,
    model,
    outcome,
    success: tests.status === 0,
    testsTampered: sha(`${root}/test/cart.test.mjs`) !== testHash,
    steps: steps.length,
    seconds: Math.round((Date.now() - startedAt) / 1000),
    promptTokens: sum('promptTokenCount'),
    outputTokens: sum('candidatesTokenCount'),
    thoughtTokens: sum('thoughtsTokenCount'),
    totalTokens: sum('totalTokenCount'),
    maxCallsInOneResponse: Math.max(0, ...steps.map((s) => s.calls?.length ?? 0)),
    toolFailures: steps.flatMap((s) => s.toolResults ?? []).filter((r) => !r.ok).length,
    toolCounts: steps.flatMap((s) => s.calls ?? []).reduce((acc, name) => ({ ...acc, [name]: (acc[name] ?? 0) + 1 }), {}),
    finalText: finalText.slice(0, 400),
  };
  writeFileSync(here(`./results/run-${runNumber}.json`), JSON.stringify({ summary, steps }, null, 2));
  return summary;
}

const summaries = [];
try {
  for (let run = 1; run <= runs; run += 1) {
    const summary = await runOnce(run);
    summaries.push(summary);
    console.log(JSON.stringify({ ...summary, finalText: undefined }));
  }
} catch (error) {
  console.error(error instanceof DailyQuotaError ? `DAILY QUOTA: ${error.message}` : error);
  process.exitCode = 1;
} finally {
  writeFileSync(here('./results/agent-probe-summary.json'), JSON.stringify(summaries, null, 2));
  console.log(`requests used: ${requestCount}`);
}
