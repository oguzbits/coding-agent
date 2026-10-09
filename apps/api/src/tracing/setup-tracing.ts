import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

/**
 * Sends traces to an OTLP/HTTP collector when OTEL_EXPORTER_OTLP_ENDPOINT is set (the exporter reads the standard
 * OTEL_* variables itself). Without it nothing is exported. Returns a function that flushes on shutdown.
 */
export function setupTracing(env: Record<string, string | undefined>): () => Promise<void> {
  if (!env.OTEL_EXPORTER_OTLP_ENDPOINT && !env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT) return async () => undefined;
  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({ 'service.name': env.OTEL_SERVICE_NAME ?? 'coding-agent' }),
    spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter())],
  });
  provider.register();
  return () => provider.shutdown();
}
