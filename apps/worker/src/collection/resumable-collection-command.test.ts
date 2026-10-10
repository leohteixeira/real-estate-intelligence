import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { CollectSourceRun, CollectSourceRunResult } from '@rei/application';
import { runCollectionOperationSpan } from '@rei/infrastructure';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { readCollectionCommandConfig } from '../config';
import { shutdownTelemetry } from '../otel';
import { runResumableCollectionCommand } from './resumable-collection-command';

vi.mock('@nestjs/core', () => ({
  NestFactory: { createApplicationContext: vi.fn() },
}));
vi.mock('../config', () => ({ readCollectionCommandConfig: vi.fn() }));
vi.mock('../otel', () => ({ shutdownTelemetry: vi.fn() }));
vi.mock('@rei/infrastructure', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@rei/infrastructure')>();
  return {
    ...actual,
    runCollectionOperationSpan: vi.fn(async (_signal, work) =>
      work({ traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01' }),
    ),
  };
});

const RESULT = {
  operationKey: 'operation-1',
  runId: '0199c8f2-2394-7ba0-8f9e-286378779210',
  sourceId: 'synthetic-portal-aurora',
  observedCount: 3,
  parsedCount: 3,
  manifestHash: `sha256:${'1'.repeat(64)}`,
  completedEventId: '0199c8f2-2394-7ba0-8f9e-286378779211',
  completedAt: '2026-10-10T00:00:03.000Z',
  replayed: false,
} as CollectSourceRunResult;

function setup(execute: CollectSourceRun['execute'], deadlineMs = 100) {
  const close = vi.fn(async (): Promise<void> => undefined);
  vi.mocked(readCollectionCommandConfig).mockReturnValue({
    deadlineMs,
    syntheticPageDelayMs: 0,
    objectStoreEndpoint: 'http://minio:9000',
    objectStoreRegion: 'us-east-1',
    objectStoreBucket: 'snapshots',
    objectStoreAccessKeyId: 'access',
    objectStoreSecretAccessKey: 'secret',
  });
  vi.mocked(NestFactory.createApplicationContext).mockResolvedValue({
    get: () => ({ execute }),
    close,
  } as never);
  return { close };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(shutdownTelemetry).mockResolvedValue(undefined);
});

describe('runResumableCollectionCommand', () => {
  it('runs exactly the explicit source/key and emits only the bounded result', async () => {
    const execute = vi.fn(async () => RESULT);
    const { close } = setup(execute);
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    await runResumableCollectionCommand(
      ['node', 'command', 'synthetic-portal-aurora', 'operation-1'],
      {},
    );

    expect(execute).toHaveBeenCalledWith(
      'synthetic-portal-aurora',
      'operation-1',
      expect.objectContaining({ traceparent: expect.any(String) }),
      expect.any(AbortSignal),
    );
    expect(runCollectionOperationSpan).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(shutdownTelemetry).toHaveBeenCalledOnce();
    const output = String(log.mock.calls[0]?.[0]);
    expect(JSON.parse(output)).toEqual({
      operationKey: RESULT.operationKey,
      sourceId: RESULT.sourceId,
      runId: RESULT.runId,
      observedCount: 3,
      parsedCount: 3,
      manifestHash: RESULT.manifestHash,
      replayed: false,
    });
    expect(output).not.toContain(RESULT.completedEventId);
    expect(output).not.toContain(RESULT.completedAt);
  });

  it.each([
    ['node', 'command'],
    ['node', 'command', 'synthetic-portal-aurora'],
    ['node', 'command', 'synthetic-portal-aurora', 'operation-1', 'extra'],
    ['node', 'command', '--source', 'operation-1'],
  ])('rejects invalid arguments before creating infrastructure: %j', async (...argv) => {
    await expect(runResumableCollectionCommand(argv, {})).rejects.toThrow(
      'Exactly one source ID and one operation key are required.',
    );
    expect(NestFactory.createApplicationContext).not.toHaveBeenCalled();
    expect(shutdownTelemetry).toHaveBeenCalledOnce();
  });

  it('propagates process cancellation and closes all owned resources', async () => {
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const execute = vi.fn(async (_sourceId, _operationKey, _traceContext, signal: AbortSignal) => {
      started();
      return new Promise<CollectSourceRunResult>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    });
    const { close } = setup(execute);
    const command = runResumableCollectionCommand(
      ['node', 'command', 'synthetic-portal-aurora', 'operation-1'],
      {},
    );
    await ready;
    process.emit('SIGTERM', 'SIGTERM');

    await expect(command).rejects.toThrow('Collection command received SIGTERM.');
    expect(close).toHaveBeenCalledOnce();
    expect(shutdownTelemetry).toHaveBeenCalledOnce();
  });
});
