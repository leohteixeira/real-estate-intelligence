/** Preloaded before HTTP/Nest; installs causal context even when exporting is disabled. */
import { PrivateTraceExporter } from './private-trace-exporter';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { NoopSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { registerTelemetryShutdown } from './telemetry-shutdown';
const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    'service.name': process.env.OTEL_SERVICE_NAME ?? 'real-estate-intelligence-ai',
  }),
  instrumentations: [new HttpInstrumentation()],
  ...(process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim()
    ? { traceExporter: new PrivateTraceExporter(new OTLPTraceExporter()) }
    : { spanProcessors: [new NoopSpanProcessor()] }),
  logRecordProcessors: [],
  metricReaders: [],
});
sdk.start();
let completion: Promise<void> | undefined;
export function shutdownTelemetry(): Promise<void> {
  completion ??= Promise.resolve().then(() => sdk.shutdown());
  return completion;
}
registerTelemetryShutdown(shutdownTelemetry);
