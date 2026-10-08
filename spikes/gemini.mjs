// Throwaway spike code. Minimal Gemini REST client: pacing, request cap, raw SSE capture, 429 inspection.
// Plain fetch instead of the SDK, so the raw responses can become fixtures for the adapter tests.
const MIN_GAP_MS = 4500; // Flash-Lite free tier: 15 requests per minute
const REQUEST_CAP = Number(process.env.REQUEST_CAP ?? 120);

let lastStart = 0;
export let requestCount = 0;

export class DailyQuotaError extends Error {}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function apiKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set');
  return key;
}

/** One streaming request. Returns the parsed chunks with arrival times and the raw text. */
async function streamGenerate(model, body) {
  if (requestCount >= REQUEST_CAP) throw new Error(`Request cap of ${REQUEST_CAP} reached`);
  const wait = lastStart + MIN_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastStart = Date.now();
  requestCount += 1;
  const started = Date.now();

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey() },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    return {
      status: response.status,
      ms: Date.now() - started,
      error: json?.error ?? { message: text.slice(0, 500) },
      rawText: text,
    };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks = [];
  let raw = '';
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const piece = decoder.decode(value, { stream: true });
    raw += piece;
    buffer += piece.replace(/\r\n/g, '\n');
    let end;
    while ((end = buffer.indexOf('\n\n')) !== -1) {
      const event = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const data = event
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join('');
      if (data) chunks.push({ tMs: Date.now() - started, json: JSON.parse(data) });
    }
  }
  return { status: 200, ms: Date.now() - started, chunks, rawText: raw };
}

/**
 * Retries 429 (minute limit) and 5xx. A daily limit aborts the whole spike.
 * `log` receives the full 429 body so we learn how minute and day limits differ and whether a wait time is given.
 */
export async function streamWithRetry(model, body, log = () => {}) {
  for (let attempt = 1; ; attempt += 1) {
    const result = await streamGenerate(model, body);
    if (result.status === 200) return { ...result, attempts: attempt };

    if (result.status === 429) {
      const details = result.error.details ?? [];
      const violations = details.flatMap((detail) => detail.violations ?? []);
      const retryInfo = details.find((detail) => String(detail['@type']).endsWith('RetryInfo'));
      log({ status: 429, attempt, errorBody: result.error });
      const daily =
        violations.some((violation) => /PerDay/i.test(violation.quotaId ?? '')) ||
        /per day|daily/i.test(result.error.message ?? '');
      if (daily) throw new DailyQuotaError(result.error.message);
      if (attempt >= 3) return { ...result, attempts: attempt };
      const seconds = Number.parseFloat(retryInfo?.retryDelay ?? '');
      await sleep((Number.isFinite(seconds) ? seconds : 30) * 1000 + 1000);
      continue;
    }

    if ([500, 503].includes(result.status) && attempt < 3) {
      log({ status: result.status, attempt, errorBody: result.error });
      await sleep(10_000);
      continue;
    }
    return { ...result, attempts: attempt };
  }
}

/** Shape of one response: parts in arrival order, usage, finish reason. */
export function summarizeResponse(chunks) {
  const parts = chunks.flatMap((chunk) => chunk.json.candidates?.[0]?.content?.parts ?? []);
  const last = chunks.at(-1)?.json;
  const usage = [...chunks].reverse().find((chunk) => chunk.json.usageMetadata)?.json.usageMetadata;
  const finishReason = [...chunks]
    .reverse()
    .map((chunk) => chunk.json.candidates?.[0]?.finishReason)
    .find(Boolean);
  const chunksWithCalls = chunks.filter((chunk) =>
    (chunk.json.candidates?.[0]?.content?.parts ?? []).some((part) => part.functionCall)
  ).length;
  return { parts, usage, finishReason, chunksWithCalls, lastChunk: last };
}
