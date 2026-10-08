import {
  ApiError,
  GoogleGenAI,
  type Content,
  type GenerateContentParameters,
  type GenerateContentResponse,
} from '@google/genai';
import { ModelError, type ModelRequest, type ModelTurn } from '../model-provider.js';
import { GeminiPartFormat, turnFromChunks, type GeminiChunk } from './parts.js';

/** The slice of the SDK client this adapter uses, so tests can stand in for it. */
export interface GeminiClient {
  models: { generateContentStream(params: GenerateContentParameters): Promise<AsyncIterable<GenerateContentResponse>> };
}

const PER_DAY = /perday/i;
const abortError = () => new DOMException('The operation was aborted', 'AbortError');
const REASON_MAX_CHARS = 300;

interface GoogleErrorBody {
  error?: {
    message?: string;
    details?: { '@type'?: string; violations?: { quotaId?: string }[]; retryDelay?: string }[];
  };
}

function parseErrorBody(message: string): GoogleErrorBody['error'] {
  try {
    return (JSON.parse(message) as GoogleErrorBody).error;
  } catch {
    return undefined;
  }
}

function rateLimitError(body: GoogleErrorBody['error']): ModelError {
  const details = body?.details ?? [];
  const quotaIds = details.flatMap((detail) => detail.violations ?? []).map((violation) => violation.quotaId ?? '');
  if (quotaIds.some((id) => PER_DAY.test(id))) {
    return new ModelError(
      'rate_limit_day',
      'The daily limit of Gemini requests is used up. It resets at midnight Pacific Time.',
    );
  }
  const delay = details.find((detail) => detail.retryDelay)?.retryDelay;
  const seconds = delay ? Number.parseFloat(delay) : Number.NaN;
  return new ModelError(
    'rate_limit_minute',
    "Gemini's per-minute limit was reached.",
    Number.isFinite(seconds) ? Math.round(seconds * 1000) : undefined,
  );
}

/** Maps an SDK failure to a ModelError. Messages never contain the request, so the key cannot leak through them. */
function toModelError(error: unknown): ModelError {
  if (!(error instanceof ApiError)) return new ModelError('unavailable', 'Gemini could not be reached.');
  const body = parseErrorBody(error.message);
  if (error.status === 401 || error.status === 403) {
    return new ModelError('auth', 'Gemini rejected the API key. Check the key in your profile.');
  }
  if (error.status === 400) {
    const reason = (body?.message ?? 'bad request').slice(0, REASON_MAX_CHARS);
    return new ModelError('bad_request', `Gemini rejected the request: ${reason}`);
  }
  if (error.status === 429) return rateLimitError(body);
  if (error.status >= 500) return new ModelError('unavailable', 'Gemini is temporarily unavailable.');
  return new ModelError('unknown', `Gemini answered with status ${error.status}.`);
}

/** The only place that talks to Gemini. Everything above it works with the neutral ModelProvider interface. */
export class GeminiProvider extends GeminiPartFormat {
  constructor(
    private readonly createClient: (apiKey: string) => GeminiClient = (apiKey) => new GoogleGenAI({ apiKey }),
  ) {
    super();
  }

  async generate(request: ModelRequest, signal: AbortSignal): Promise<ModelTurn> {
    try {
      const stream = await this.createClient(request.apiKey).models.generateContentStream({
        model: request.model,
        // The stored parts are exactly what Gemini sent, so they are sent back as they are.
        contents: request.history as Content[],
        config: {
          systemInstruction: request.systemPrompt,
          ...(request.tools.length > 0 ? { tools: [{ functionDeclarations: request.tools }] } : {}),
          abortSignal: signal,
        },
      });
      const chunks: GeminiChunk[] = [];
      for await (const chunk of stream) chunks.push(chunk as GeminiChunk);
      return turnFromChunks(chunks);
    } catch (error) {
      if (signal.aborted) throw abortError();
      throw toModelError(error);
    }
  }
}
