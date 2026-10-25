import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readCollectionCommandConfig } from '../config';
import { shutdownTelemetry } from '../otel';
import { runListingRemovalCommand } from './remove-listing-command';
vi.mock('@nestjs/core', () => ({ NestFactory: { createApplicationContext: vi.fn() } }));
vi.mock('../config', () => ({ readCollectionCommandConfig: vi.fn() }));
vi.mock('../otel', () => ({ shutdownTelemetry: vi.fn() }));
vi.mock('@rei/infrastructure', async (original) => ({
  ...(await original<typeof import('@rei/infrastructure')>()),
  runCollectionOperationSpan: vi.fn(async (_signal, work) => work(null)),
}));
const id = '0199c8f2-2394-7ba0-8f9e-286378779211';
const argv = ['node', 'command', 'synthetic-data', 'SYN-SP-0001'];
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readCollectionCommandConfig).mockReturnValue({ deadlineMs: 50 } as never);
  vi.mocked(shutdownTelemetry).mockResolvedValue(undefined);
});
describe('listing removal command', () => {
  it('executes exactly two validated arguments, emits durable identity and closes resources', async () => {
    const result = {
      sourceId: 'synthetic-data',
      sourceListingId: 'SYN-SP-0001',
      suppressionId: id,
      eventId: id,
      suppressedAt: '2026-10-25T00:00:00Z',
      completed: true,
    };
    const execute = vi.fn(async () => result);
    const close = vi.fn(async () => undefined);
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.mocked(NestFactory.createApplicationContext).mockResolvedValue({
      get: () => ({ execute }),
      close,
    } as never);
    await runListingRemovalCommand(argv, {});
    expect(execute).toHaveBeenCalledWith(
      'synthetic-data',
      'SYN-SP-0001',
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
      ['synthetic-data'],
      ['synthetic-data', 'listing', 'extra'],
      ['--source', 'listing'],
      ['../unsafe', 'listing'],
      ['synthetic-data', 'unsafe listing'],
    ].map((values) => ({ values })),
  )('rejects malformed arguments $values before bootstrap', async ({ values }) => {
    await expect(
      runListingRemovalCommand(['node', 'command', ...values], {}),
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
    await expect(runListingRemovalCommand(argv, {})).rejects.toBeDefined();
    resolve({ close } as never);
    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
  });
  it('propagates SIGTERM and preserves the primary failure through cleanup', async () => {
    let ready!: () => void;
    const started = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const execute = vi.fn(async (_source, _listing, _trace, signal: AbortSignal) => {
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
    const command = runListingRemovalCommand(argv, {});
    await started;
    process.emit('SIGTERM', 'SIGTERM');
    await expect(command).rejects.toThrow('Listing removal command interrupted.');
    expect(close).toHaveBeenCalledOnce();
  });
});
