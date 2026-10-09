import { SpanStatusCode } from '@opentelemetry/api';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { withSpan } from './with-span.js';

const exporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });

describe('withSpan', () => {
  beforeAll(() => provider.register());
  afterAll(() => provider.shutdown());
  beforeEach(() => exporter.reset());

  it('records a finished span with its attributes and returns the result', async () => {
    const result = await withSpan('work', { 'run.id': 'r1' }, async (span) => {
      span.setAttribute('steps', 2);
      return 42;
    });
    const [span] = exporter.getFinishedSpans();
    expect(result).toBe(42);
    expect(span.name).toBe('work');
    expect(span.attributes).toEqual({ 'run.id': 'r1', steps: 2 });
    expect(span.status.code).not.toBe(SpanStatusCode.ERROR);
  });

  it('nests spans started inside it', async () => {
    await withSpan('outer', {}, () => withSpan('inner', {}, async () => undefined));
    const spans = exporter.getFinishedSpans();
    const inner = spans.find((s) => s.name === 'inner');
    const outer = spans.find((s) => s.name === 'outer');
    expect(inner?.parentSpanContext?.spanId).toBe(outer?.spanContext().spanId);
  });

  it('marks failures with the error type only, never its message, and rethrows', async () => {
    await expect(
      withSpan('fails', {}, async () => {
        throw new TypeError('contains file content secret-123');
      }),
    ).rejects.toThrow('secret-123');
    const [span] = exporter.getFinishedSpans();
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
    expect(span.attributes['error.type']).toBe('TypeError');
    expect(JSON.stringify([span.status, span.attributes, span.events])).not.toContain('secret-123');
  });

  it('does not count an abort as an error', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    await expect(
      withSpan('stopped', {}, async () => {
        throw abort;
      }),
    ).rejects.toBe(abort);
    const [span] = exporter.getFinishedSpans();
    expect(span.status.code).not.toBe(SpanStatusCode.ERROR);
    expect(span.attributes['aborted']).toBe(true);
  });
});
