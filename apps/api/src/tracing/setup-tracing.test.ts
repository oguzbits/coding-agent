import { trace, type ProxyTracerProvider } from '@opentelemetry/api';
import { setupTracing } from './setup-tracing.js';

// The API hands out a stable proxy; what changes is the provider behind it.
const delegate = () => (trace.getTracerProvider() as ProxyTracerProvider).getDelegate();

describe('setupTracing', () => {
  it('exports nothing and installs nothing without an endpoint', async () => {
    const before = delegate();
    const shutdown = setupTracing({});
    expect(delegate()).toBe(before);
    await expect(shutdown()).resolves.toBeUndefined();
  });

  it('installs a tracer provider when an OTLP endpoint is configured, and can flush it', async () => {
    const before = delegate();
    const shutdown = setupTracing({ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318' });
    expect(delegate()).not.toBe(before);
    await shutdown();
  });
});
