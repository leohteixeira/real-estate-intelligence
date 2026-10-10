import { NestFactory } from '@nestjs/core';
import type { CollectionExecutionResult, CollectSourceOnce } from '@rei/application';
import { runCollectionOperationSpan } from '@rei/infrastructure';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { readCollectionCommandConfig } from '../config';
import { shutdownTelemetry } from '../otel';
import { runSyntheticCollectionCommand } from './synthetic-collection-command';

vi.mock('@nestjs/core', () => ({
  NestFactory: { createApplicationContext: vi.fn() },
}));
vi.mock('../config', () => ({ readCollectionCommandConfig: vi.fn() }));
vi.mock('../otel', () => ({ shutdownTelemetry: vi.fn() }));
vi.mock('@rei/infrastructure', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@rei/infrastructure')>();
  return {
    ...actual,
    runCollectionOperationSpan: vi.fn(async (signal, work) =>
      work({ traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01' }),
    ),
  };
});

const RESULT = {
  operationKey: 'operation-1',
  sourceId: 'synthetic-data',
  runId: '0199c8f2-2394-7ba0-8f9e-286378779210',
  snapshotId: '0199c8f2-2394-7ba0-8f9e-286378779211',
  parsedEventId: '0199c8f2-2394-7ba0-8f9e-286378779212',
  completedEventId: '0199c8f2-2394-7ba0-8f9e-286378779213',
  contentHash: `sha256:${'1'.repeat(64)}`,
  objectKey: `synthetic/sha256/${'1'.repeat(64)}.json`,
  replayed: false,
} as CollectionExecutionResult;

function setup(execute: CollectSourceOnce['execute'], deadlineMs = 100) {
  const close = vi.fn(async (): Promise<void> => undefined);
  vi.mocked(readCollectionCommandConfig).mockReturnValue({
    deadlineMs,
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

describe('runSyntheticCollectionCommand', () => {
  it('runs one traced explicit operation and closes Nest and telemetry after success', async () => {
    const execute = vi.fn(async () => RESULT);
    const { close } = setup(execute);

    await runSyntheticCollectionCommand(['node', 'command', 'operation-1'], {});

    expect(execute).toHaveBeenCalledWith(
      'synthetic-data',
      'operation-1',
      expect.objectContaining({ traceparent: expect.any(String) }),
      expect.any(AbortSignal),
    );
    expect(runCollectionOperationSpan).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(shutdownTelemetry).toHaveBeenCalledOnce();
  });

  it.each(['SIGINT', 'SIGTERM'] as const)(
    'propagates %s cancellation and still closes all owned resources',
    async (signalName) => {
      let started!: () => void;
      const ready = new Promise<void>((resolve) => {
        started = resolve;
      });
      const execute = vi.fn(
        async (_sourceId, _operationKey, _traceContext, signal: AbortSignal) => {
          started();
          return new Promise<CollectionExecutionResult>((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason), { once: true });
          });
        },
      );
      const { close } = setup(execute);
      const command = runSyntheticCollectionCommand(['node', 'command', 'operation-1'], {});
      await ready;

      process.emit(signalName, signalName);

      await expect(command).rejects.toThrow(`Collection command received ${signalName}.`);
      expect(close).toHaveBeenCalledOnce();
      expect(shutdownTelemetry).toHaveBeenCalledOnce();
    },
  );

  it('propagates deadline cancellation and still closes all owned resources', async () => {
    const execute = vi.fn(
      async (_sourceId, _operationKey, _traceContext, signal: AbortSignal) =>
        new Promise<CollectionExecutionResult>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        }),
    );
    const { close } = setup(execute, 5);

    const command = runSyntheticCollectionCommand(['node', 'command', 'operation-1'], {});

    await expect(command).rejects.toMatchObject({ name: 'TimeoutError' });
    expect(close).toHaveBeenCalledOnce();
    expect(shutdownTelemetry).toHaveBeenCalledOnce();
  });

  it('requires an explicit operation key and still shuts telemetry down', async () => {
    await expect(runSyntheticCollectionCommand(['node', 'command'], {})).rejects.toThrow(
      'An explicit collection operation key is required.',
    );
    expect(NestFactory.createApplicationContext).not.toHaveBeenCalled();
    expect(shutdownTelemetry).toHaveBeenCalledOnce();
  });

  it('attempts telemetry cleanup when Nest close rejects', async () => {
    const execute = vi.fn(async () => RESULT);
    const { close } = setup(execute);
    close.mockRejectedValue(new Error('Nest close failed'));

    await expect(
      runSyntheticCollectionCommand(['node', 'command', 'operation-1'], {}),
    ).rejects.toThrow('Nest close failed');
    expect(close).toHaveBeenCalledOnce();
    expect(shutdownTelemetry).toHaveBeenCalledOnce();
  });

  it('preserves the operation failure when both cleanup attempts reject', async () => {
    const execute = vi.fn(async () => Promise.reject(new Error('collection failed')));
    const { close } = setup(execute);
    close.mockRejectedValue(new Error('Nest close failed'));
    vi.mocked(shutdownTelemetry).mockRejectedValue(new Error('telemetry shutdown failed'));

    await expect(
      runSyntheticCollectionCommand(['node', 'command', 'operation-1'], {}),
    ).rejects.toThrow('collection failed');
    expect(close).toHaveBeenCalledOnce();
    expect(shutdownTelemetry).toHaveBeenCalledOnce();
  });

  it('bounds cleanup attempts by the validated collection deadline', async () => {
    vi.useFakeTimers();
    try {
      const execute = vi.fn(async () => RESULT);
      const { close } = setup(execute, 5);
      close.mockImplementation(() => new Promise<void>(() => {}));
      vi.mocked(shutdownTelemetry).mockImplementation(() => new Promise<void>(() => {}));

      const command = runSyntheticCollectionCommand(['node', 'command', 'operation-1'], {});
      const rejection = expect(command).rejects.toThrow(
        'Nest application context cleanup did not finish within 5ms.',
      );
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(5);

      await rejection;
      expect(close).toHaveBeenCalledOnce();
      expect(shutdownTelemetry).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
