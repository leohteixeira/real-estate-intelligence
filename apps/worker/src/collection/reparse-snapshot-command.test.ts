import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readCollectionCommandConfig } from '../config';
import { shutdownTelemetry } from '../otel';
import { runSnapshotReparseCommand } from './reparse-snapshot-command';
vi.mock('@nestjs/core', () => ({ NestFactory: { createApplicationContext: vi.fn() } }));
vi.mock('../config', () => ({ readCollectionCommandConfig: vi.fn() }));
vi.mock('../otel', () => ({ shutdownTelemetry: vi.fn() }));
vi.mock('@rei/infrastructure', async (original) => ({
  ...(await original<typeof import('@rei/infrastructure')>()),
  runCollectionOperationSpan: vi.fn(async (_signal, work) => work(null)),
}));
const id = '0199c8f2-2394-7ba0-8f9e-286378779211';
const argv = ['node', 'command', id, 'parser-v2', 'operation-1'];
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readCollectionCommandConfig).mockReturnValue({ deadlineMs: 50 } as never);
  vi.mocked(shutdownTelemetry).mockResolvedValue(undefined);
});
describe('snapshot reparse command', () => {
  it('executes exactly three validated arguments, emits durable identity and closes resources', async () => {
    const result = {
      snapshotId: id,
      parserRevision: 'parser-v2',
      operationKey: 'operation-1',
      eventId: id,
      order: 1,
      replayed: false,
    };
    const execute = vi.fn(async () => result);
    const close = vi.fn(async () => undefined);
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.mocked(NestFactory.createApplicationContext).mockResolvedValue({
      get: () => ({ execute }),
      close,
    } as never);
    await runSnapshotReparseCommand(argv, {});
    expect(execute).toHaveBeenCalledWith(
      id,
      'parser-v2',
      'operation-1',
      null,
      expect.any(AbortSignal),
      expect.any(Number),
    );
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toEqual({ status: 'completed', ...result });
    expect(close).toHaveBeenCalledOnce();
    expect(shutdownTelemetry).toHaveBeenCalledOnce();
  });
  it.each(
    [
      [],
      [id],
      [id, 'rev'],
      [id, 'rev', 'op', 'extra'],
      ['--snapshot', 'rev', 'op'],
      [id, 'unsafe label', 'op'],
    ].map((values) => ({ values })),
  )('rejects malformed arguments $values before bootstrap', async ({ values }) => {
    await expect(
      runSnapshotReparseCommand(['node', 'command', ...values], {}),
    ).rejects.toBeDefined();
    expect(NestFactory.createApplicationContext).not.toHaveBeenCalled();
    expect(shutdownTelemetry).toHaveBeenCalledOnce();
  });
  it('bounds bootstrap and closes a context delivered after the deadline', async () => {
    const close = vi.fn(async () => undefined);
    let resolve!: (value: never) => void;
    vi.mocked(NestFactory.createApplicationContext).mockReturnValue(
      new Promise((ready) => {
        resolve = ready;
      }),
    );
    await expect(runSnapshotReparseCommand(argv, {})).rejects.toBeDefined();
    resolve({ close } as never);
    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
  });
  it('propagates SIGTERM and preserves the primary failure through cleanup', async () => {
    let ready!: () => void;
    const started = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const execute = vi.fn(async (_id, _revision, _key, _trace, signal: AbortSignal) => {
      ready();
      return new Promise((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(signal.reason), { once: true }),
      );
    });
    const close = vi.fn(async () => {
      throw new Error('Cleanup failed');
    });
    vi.mocked(NestFactory.createApplicationContext).mockResolvedValue({
      get: () => ({ execute }),
      close,
    } as never);
    const command = runSnapshotReparseCommand(argv, {});
    await started;
    process.emit('SIGTERM', 'SIGTERM');
    await expect(command).rejects.toThrow('Snapshot reparse command interrupted.');
    expect(close).toHaveBeenCalledOnce();
  });
});
