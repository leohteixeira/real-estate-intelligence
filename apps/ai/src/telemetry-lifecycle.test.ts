import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import {
  AiTelemetryLifecycle,
  AiTelemetryShutdownError,
  TELEMETRY_SHUTDOWN,
} from './telemetry-lifecycle';
import { registerTelemetryShutdown, telemetryShutdownCallback } from './telemetry-shutdown';
import { TelemetryModule } from './telemetry.module';

describe('AI telemetry lifecycle', () => {
  it('has an SDK-free no-op when the preload is absent', async () => {
    await expect(telemetryShutdownCallback()()).resolves.toBeUndefined();
  });
  it('uses the preload bridge and flushes exactly once through Nest shutdown', async () => {
    const previous = telemetryShutdownCallback(),
      shutdown = vi.fn().mockResolvedValue(undefined);
    registerTelemetryShutdown(shutdown);
    try {
      const app = await Test.createTestingModule({ imports: [TelemetryModule] }).compile();
      await app.init();
      const lifecycle = app.get(AiTelemetryLifecycle);
      await app.close();
      await Promise.all([lifecycle.onApplicationShutdown(), lifecycle.onApplicationShutdown()]);
      expect(shutdown).toHaveBeenCalledOnce();
    } finally {
      registerTelemetryShutdown(previous);
    }
  });
  it('shares an in-flight flush and retains one sanitized failure without retrying', async () => {
    const failure = new Error('private exporter credential'),
      shutdown = vi.fn().mockImplementation(() => {
        throw failure;
      });
    const logger = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    try {
      const app = await Test.createTestingModule({ imports: [TelemetryModule] })
        .overrideProvider(TELEMETRY_SHUTDOWN)
        .useValue(shutdown)
        .compile();
      const lifecycle = app.get(AiTelemetryLifecycle),
        first = lifecycle.onApplicationShutdown(),
        second = lifecycle.onApplicationShutdown();
      expect(first).toBe(second);
      const retained = await first.catch((error: unknown) => error);
      expect(retained).toBeInstanceOf(AiTelemetryShutdownError);
      if (!(retained instanceof AiTelemetryShutdownError))
        throw new Error('Expected safe shutdown failure.');
      expect(retained.originalFailure()).toBe(failure);
      expect(String(retained)).not.toContain('private exporter credential');
      expect(JSON.stringify(retained)).not.toContain('private exporter credential');
      await expect(second).rejects.toBe(retained);
      await expect(lifecycle.onApplicationShutdown()).rejects.toBe(retained);
      expect(shutdown).toHaveBeenCalledOnce();
      expect(logger).toHaveBeenCalledExactlyOnceWith('AI telemetry shutdown failed.');
    } finally {
      logger.mockRestore();
    }
  });
});
