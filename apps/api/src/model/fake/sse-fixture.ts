import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { turnFromChunks, type GeminiChunk } from '../gemini/parts.js';
import type { ModelTurn } from '../model-provider.js';

/** Turns the raw SSE body of one recorded Gemini response into a model turn. */
function turnFromSse(raw: string): ModelTurn {
  const chunks = raw
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice('data: '.length)) as GeminiChunk);
  return turnFromChunks(chunks);
}

/** Loads `*-step-N.sse` files of one recorded run, ordered by N. */
export function loadSseFixtureTurns(dir: string): ModelTurn[] {
  const stepOf = (name: string) => Number(name.match(/step-(\d+)\.sse$/)?.[1]);
  return readdirSync(dir)
    .filter((name) => /step-\d+\.sse$/.test(name))
    .sort((a, b) => stepOf(a) - stepOf(b))
    .map((name) => turnFromSse(readFileSync(join(dir, name), 'utf8')));
}
