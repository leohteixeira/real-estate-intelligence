import { ROOT_CONTEXT, trace, TraceFlags } from '@opentelemetry/api';
import { NoopSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { afterAll, describe, expect, it } from 'vitest';

import { shutdownTelemetry, telemetryExporterConfiguration } from './otel';

describe('worker telemetry lifecycle', () => {
  afterAll(async () => {
    await shutdownTelemetry();
  });

  it('disables implicit exporters when no collector endpoint is configured', () => {
    const configuration = telemetryExporterConfiguration(false);

    expect(configuration).toMatchObject({
      logRecordProcessors: [],
      metricReaders: [],
    });
    expect(configuration.spanProcessors).toHaveLength(1);
    expect(configuration.spanProcessors?.[0]).toBeInstanceOf(NoopSpanProcessor);
  });

  it('keeps a real tracer provider active without an exporter', () => {
    const parent = trace.setSpanContext(ROOT_CONTEXT, {
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      spanId: '00f067aa0ba902b7',
      traceFlags: TraceFlags.SAMPLED,
      isRemote: true,
    });
    const child = trace
      .getTracer('rei.worker.telemetry-test')
      .startSpan('child', undefined, parent);

    expect(child.spanContext().traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    expect(child.spanContext().spanId).not.toBe('00f067aa0ba902b7');
    child.end();
  });
});
