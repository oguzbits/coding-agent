import { SpanStatusCode, trace, type Attributes, type Span } from '@opentelemetry/api';

const tracer = trace.getTracer('coding-agent');

const isAbort = (error: unknown) => error instanceof Error && error.name === 'AbortError';

/**
 * Runs `work` inside a span that ends when it settles. Without a configured SDK this costs next to nothing.
 * Callers pass ids, names and counts as attributes, never prompts, arguments, outputs or keys; a failure records the
 * error type only, because messages can carry file content.
 */
export function withSpan<T>(name: string, attributes: Attributes, work: (span: Span) => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await work(span);
    } catch (error) {
      if (isAbort(error)) {
        span.setAttribute('aborted', true);
      } else {
        span.setStatus({ code: SpanStatusCode.ERROR });
        span.setAttribute('error.type', error instanceof Error ? error.name : 'unknown');
      }
      throw error;
    } finally {
      span.end();
    }
  });
}
