/**
 * OpenTelemetry bootstrap.
 *
 * This module must be loaded **before** anything it instruments, which is why
 * the start script preloads it with `node -r ./dist/otel.js`. Calling it from
 * inside main.ts would be too late: http and pg would already have
 * been required and could no longer be patched.
 *
 * Instrumentation is always installed; exporting only happens when
 * OTEL_EXPORTER_OTLP_ENDPOINT is configured, so a developer without a collector
 * still gets a working process.
 */
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { NoopSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

const serviceName = process.env.OTEL_SERVICE_NAME ?? 'real-estate-intelligence-worker';
const exportEnabled = Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim());

export function telemetryExporterConfiguration(enabled: boolean) {
  return enabled
    ? {
        traceExporter: new OTLPTraceExporter(),
        metricReader: new PeriodicExportingMetricReader({
          exporter: new OTLPMetricExporter(),
        }),
      }
    : {
        // A no-export processor keeps the tracer provider active while the empty
        // log and metric arrays suppress the SDK's implicit OTLP exporters.
        spanProcessors: [new NoopSpanProcessor()],
        logRecordProcessors: [],
        metricReaders: [],
      };
}

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
    [ATTR_SERVICE_VERSION]: process.env.npm_package_version ?? '0.0.0',
  }),
  instrumentations: [new HttpInstrumentation(), new PgInstrumentation()],
  ...telemetryExporterConfiguration(exportEnabled),
});

sdk.start();

/** Called by the worker's single ordered, deadline-bound shutdown path. */
export async function shutdownTelemetry(): Promise<void> {
  await sdk.shutdown();
}
