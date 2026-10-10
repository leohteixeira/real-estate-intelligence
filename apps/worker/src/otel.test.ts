import { afterAll, describe, expect, it } from 'vitest';

import { shutdownTelemetry, telemetryExporterConfiguration } from './otel';

describe('worker telemetry lifecycle', () => {
  afterAll(async () => {
    await shutdownTelemetry();
  });

  it('disables implicit exporters when no collector endpoint is configured', () => {
    expect(telemetryExporterConfiguration(false)).toEqual({
      spanProcessors: [],
      logRecordProcessors: [],
      metricReaders: [],
    });
  });
});
