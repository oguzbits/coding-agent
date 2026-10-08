import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ModelTurn, ProviderPart } from '../model-provider.js';
import { turnFromParts } from '../gemini/parts.js';

interface GeminiChunk {
  candidates?: { content?: { parts?: ProviderPart[] }; finishReason?: string }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

/** Turns the raw SSE body of one recorded Gemini response into a model turn. Parts stay in arrival order, unmerged. */
function turnFromSse(raw: string): ModelTurn {
  const chunks = raw
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice('data: '.length)) as GeminiChunk);
  const parts = chunks.flatMap((chunk) => chunk.candidates?.[0]?.content?.parts ?? []);
  const finishReason = chunks.map((chunk) => chunk.candidates?.[0]?.finishReason).findLast(Boolean) ?? 'STOP';
  const usage = chunks.map((chunk) => chunk.usageMetadata).findLast(Boolean);
  return turnFromParts(
    parts,
    { promptTokens: usage?.promptTokenCount ?? 0, outputTokens: usage?.candidatesTokenCount ?? 0 },
    finishReason,
  );
}

/** Loads `*-step-N.sse` files of one recorded run, ordered by N. */
export function loadSseFixtureTurns(dir: string): ModelTurn[] {
  const stepOf = (name: string) => Number(name.match(/step-(\d+)\.sse$/)?.[1]);
  return readdirSync(dir)
    .filter((name) => /step-\d+\.sse$/.test(name))
    .sort((a, b) => stepOf(a) - stepOf(b))
    .map((name) => turnFromSse(readFileSync(join(dir, name), 'utf8')));
}
