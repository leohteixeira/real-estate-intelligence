import { ConsoleLogger, Logger, type LogLevel } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  CLOCK,
  COLLECTION_RUN_REPOSITORY,
  CollectSourceRun,
  ExternalFailure,
  OUTBOX_APPEND_PORT,
  RAW_SNAPSHOT_STORE,
  SNAPSHOT_SANITIZER,
  SOURCE_REGISTER_REPOSITORY,
  TRANSACTION_RUNNER,
  UUID_V7_GENERATOR,
  Transaction,
  type CollectSourceRunResult,
  type TransactionWork,
} from '@rei/application';
import { createSourceRegistration, type UuidV7 } from '@rei/domain';
import {
  CanonicalSnapshotSanitizer,
  InMemoryCollectionRunRepository,
  InMemoryRawSnapshotStore,
  InMemorySourceRegisterRepository,
  PostgresListingSuppression,
  SYNTHETIC_SAO_PAULO_DATASET,
  runCollectionOperationSpan,
} from '@rei/infrastructure';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readCollectionCommandConfig } from '../config';
import { shutdownTelemetry } from '../otel';
import { DATABASE_CONNECTION } from '../persistence.module';
import { runSeedSyntheticCommand } from './seed-synthetic-command';
import { ResumableCollectionCommandModule } from './resumable-collection-command.module';

vi.mock('@nestjs/core', () => ({ NestFactory: { createApplicationContext: vi.fn() } }));
vi.mock('../config', () => ({ readCollectionCommandConfig: vi.fn() }));
vi.mock('../otel', () => ({ shutdownTelemetry: vi.fn() }));
vi.mock('@rei/infrastructure', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@rei/infrastructure')>()),
  runCollectionOperationSpan: vi.fn(async (_signal, work) =>
    work({ traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01' }),
  ),
}));

class FixtureTransaction extends Transaction {
  public constructor() {
    super();
  }
}
const argv = ['node', 'seed-synthetic'];
const transaction = new FixtureTransaction();

function setup(deadlineMs = 1_000) {
  vi.mocked(readCollectionCommandConfig).mockReturnValue({
    deadlineMs,
    syntheticPageDelayMs: 0,
    objectStoreEndpoint: 'http://storage.invalid',
    objectStoreRegion: 'fixture',
    objectStoreBucket: 'fixture',
    objectStoreAccessKeyId: 'fixture',
    objectStoreSecretAccessKey: 'fixture',
  });
  const register = new InMemorySourceRegisterRepository(
    SYNTHETIC_SAO_PAULO_DATASET.sources.map(({ sourceId, displayLabel }) =>
      createSourceRegistration({
        sourceId,
        displayLabel,
        category: 'synthetic-listing',
        enabled: true,
        enabledAt: '2026-10-26T00:00:00.000Z',
        permissions: {
          collectionAllowed: true,
          imageFetchingAllowed: true,
          listingTextDisplayAllowed: true,
        },
        review: { outcome: 'not-required', reviewedAt: null, evidence: 'Repository fixture.' },
        access: { method: 'repository-fixture', detail: 'Checked-in dataset.' },
        rate: { status: 'not-applicable', limit: null, windowSeconds: null },
        licence: { status: 'not-applicable', label: 'Synthetic data', url: null },
      }),
    ),
  );
  const runs = new InMemoryCollectionRunRepository();
  const snapshots = new InMemoryRawSnapshotStore();
  const append = vi.fn(async () => undefined);
  let nextId = 1;
  const dependencies = new Map<unknown, unknown>([
    [SOURCE_REGISTER_REPOSITORY, register],
    [COLLECTION_RUN_REPOSITORY, runs],
    [RAW_SNAPSHOT_STORE, snapshots],
    [SNAPSHOT_SANITIZER, new CanonicalSnapshotSanitizer()],
    [CLOCK, { now: () => new Date().toISOString() }],
    [
      UUID_V7_GENERATOR,
      {
        generate: async () =>
          `0199c8f2-2394-7ba0-8f9e-${String(nextId++).padStart(12, '0')}` as UuidV7,
      },
    ],
    [TRANSACTION_RUNNER, { runInTransaction: <T>(work: TransactionWork<T>) => work(transaction) }],
    [OUTBOX_APPEND_PORT, { append }],
    [DATABASE_CONNECTION, {}],
  ]);
  const close = vi.fn(async () => undefined);
  vi.mocked(NestFactory.createApplicationContext).mockResolvedValue({
    get: (token: unknown) => dependencies.get(token),
    close,
  } as never);
  vi.spyOn(PostgresListingSuppression.prototype, 'isSuppressed').mockResolvedValue(false);
  vi.spyOn(PostgresListingSuppression.prototype, 'lockAndCheck').mockResolvedValue(false);
  const log = vi.spyOn(ConsoleLogger.prototype, 'log').mockImplementation(() => undefined);
  return { register, runs, snapshots, append, close, log };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(shutdownTelemetry).mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('runSeedSyntheticCommand', () => {
  it('collects all months sequentially with exact raw bytes, checkpoints and replay without duplicate events', async () => {
    const { runs, snapshots, append, close, log } = setup();
    const execute = vi.spyOn(CollectSourceRun.prototype, 'execute');
    await runSeedSyntheticCommand(argv, {});
    expect(NestFactory.createApplicationContext).toHaveBeenCalledWith(
      ResumableCollectionCommandModule,
      { logger: ['error', 'warn'] },
    );
    const keys = SYNTHETIC_SAO_PAULO_DATASET.runs.flatMap((cycle) =>
      SYNTHETIC_SAO_PAULO_DATASET.sources.map(({ sourceId }) => ({
        sourceId,
        cycle,
        operationKey: `seed:${SYNTHETIC_SAO_PAULO_DATASET.version}:${cycle.runKey}:${sourceId}`,
      })),
    );
    expect(
      execute.mock.calls.map(([sourceId, operationKey]) => ({ sourceId, operationKey })),
    ).toEqual(keys.map(({ sourceId, operationKey }) => ({ sourceId, operationKey })));
    expect(runCollectionOperationSpan).toHaveBeenCalledTimes(39);
    for (const { sourceId, cycle, operationKey } of keys) {
      const run = await runs.loadRunByOperationKey(operationKey);
      const expected = cycle.observations.filter((item) => item.sourceId === sourceId);
      expect(run).toMatchObject({
        status: 'completed',
        sourceId,
        checkpoint: { cursor: `fixture:${cycle.runKey}:${expected.length}` },
        counts: { observed: expected.length, parsed: expected.length, failed: 0, suppressed: 0 },
      });
      expect(run!.startedAt).not.toBe(cycle.observedAt);
      const observations = await runs.listObservations(transaction, run!.runId);
      expect(observations).toHaveLength(expected.length);
      for (const [index, observation] of observations.entries()) {
        expect(observation.observedAt).toBe(cycle.observedAt);
        expect(snapshots.read(observation.objectKey)).toEqual(
          Uint8Array.from(Buffer.from(JSON.stringify(expected[index]!.listing), 'utf8')),
        );
      }
    }
    expect(runs.parsedEvidence).toHaveLength(115);
    expect(runs.completedEvidence).toHaveLength(39);
    const priorEvents = append.mock.calls.length;
    const priorObjects = snapshots.size;
    await runSeedSyntheticCommand(argv, {});
    expect(append).toHaveBeenCalledTimes(priorEvents);
    expect(snapshots.size).toBe(priorObjects);
    expect(runs.parsedEvidence).toHaveLength(115);
    expect(runs.completedEvidence).toHaveLength(39);
    expect(
      log.mock.calls.slice(39).every(([value]) => JSON.parse(String(value)).replayed === true),
    ).toBe(true);
    expect(close).toHaveBeenCalledTimes(2);
    expect(shutdownTelemetry).toHaveBeenCalledTimes(2);
  });

  it('emits actual collection and replay receipts when Nest global logging excludes log', async () => {
    const { log } = setup();
    log.mockRestore();
    const levels: LogLevel[] = ['log', 'error', 'warn', 'debug', 'verbose', 'fatal'];
    const previousLevels = levels.filter((level) => Logger.isLevelEnabled(level));
    const output = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      Logger.overrideLogger(['error', 'warn']);
      expect(Logger.isLevelEnabled('log')).toBe(false);
      new Logger('bootstrap').log('globally restricted log');
      expect(output).not.toHaveBeenCalled();

      await runSeedSyntheticCommand(argv, {});
      await runSeedSyntheticCommand(argv, {});

      const receipts = output.mock.calls.map(([chunk]) => String(chunk));
      expect(receipts).toHaveLength(78);
      expect(receipts.slice(0, 39).every((receipt) => receipt.includes('"replayed":false'))).toBe(
        true,
      );
      expect(receipts.slice(39).every((receipt) => receipt.includes('"replayed":true'))).toBe(true);
      expect(receipts[0]).toContain(
        '"operationKey":"seed:synthetic-sao-paulo-v1:2025-10:synthetic-portal-aurora"',
      );
      expect(Logger.isLevelEnabled('log')).toBe(false);
    } finally {
      Logger.overrideLogger(previousLevels);
    }
  });

  it.each(['missing', 'disabled', 'held', 'forbidden'])(
    'requires every portal eligible before mutating any run: %s',
    async (reason) => {
      const { register, runs, close } = setup();
      const original = register.findById.bind(register);
      vi.spyOn(register, 'findById').mockImplementation(async (sourceId, signal) => {
        const source = await original(sourceId, signal);
        if (sourceId !== SYNTHETIC_SAO_PAULO_DATASET.sources[2]!.sourceId || !source) return source;
        if (reason === 'missing') return null;
        return {
          ...source,
          enabled: reason !== 'disabled',
          hold: reason === 'held' ? { reason: 'captcha', heldAt: '2026-10-26T00:00:00Z' } : null,
          permissions: { ...source.permissions, collectionAllowed: reason !== 'forbidden' },
        };
      });
      const start = vi.spyOn(runs, 'startOrLoad');
      await expect(runSeedSyntheticCommand(argv, {})).rejects.toMatchObject({
        kind: 'forbidden',
        operation: 'collection.seed.preflight',
      });
      expect(start).not.toHaveBeenCalled();
      expect(close).toHaveBeenCalledOnce();
    },
  );

  it('preserves completed progress after failure and resumes using the same keys', async () => {
    const { runs } = setup();
    const original = CollectSourceRun.prototype.execute;
    let count = 0;
    const failure = new ExternalFailure({ kind: 'exhausted', operation: 'raw-snapshot.store' });
    vi.spyOn(CollectSourceRun.prototype, 'execute').mockImplementation(function (
      this: CollectSourceRun,
      ...args
    ) {
      if (++count === 3) throw failure;
      return original.apply(this, args);
    });
    await expect(runSeedSyntheticCommand(argv, {})).rejects.toBe(failure);
    expect(runs.completedEvidence).toHaveLength(2);
    await runSeedSyntheticCommand(argv, {});
    expect(runs.completedEvidence).toHaveLength(39);
    expect(runs.parsedEvidence).toHaveLength(115);
  });

  it('stops on a durable pause without attempting the next source', async () => {
    setup();
    const execute = vi
      .spyOn(CollectSourceRun.prototype, 'execute')
      .mockResolvedValue({ status: 'paused' } as CollectSourceRunResult);
    await expect(runSeedSyntheticCommand(argv, {})).rejects.toMatchObject({
      operation: 'collection.seed.paused',
    });
    expect(execute).toHaveBeenCalledOnce();
  });

  it.each(['SIGINT', 'SIGTERM'] as const)(
    'propagates %s and preserves primary failure through cleanup',
    async (event) => {
      const { close } = setup();
      close.mockRejectedValue(new Error('cleanup failed'));
      vi.spyOn(CollectSourceRun.prototype, 'execute').mockImplementation(
        async (_source, _key, _trace, signal) => {
          process.emit(event, event);
          signal.throwIfAborted();
          throw new Error('unreachable');
        },
      );
      await expect(runSeedSyntheticCommand(argv, {})).rejects.toThrow(
        `Seed command received ${event}.`,
      );
      expect(close).toHaveBeenCalledOnce();
      expect(shutdownTelemetry).toHaveBeenCalledOnce();
    },
  );

  it('uses the existing deadline for each run and bounds cleanup', async () => {
    const { close } = setup(20);
    close.mockImplementation(() => new Promise(() => {}));
    const execute = vi
      .spyOn(CollectSourceRun.prototype, 'execute')
      .mockImplementation(async (_source, _key, _trace, signal, deadlineAt) => {
        expect(deadlineAt! - Date.now()).toBeLessThanOrEqual(20);
        return new Promise((_resolve, reject) =>
          signal.addEventListener('abort', () => reject(signal.reason), { once: true }),
        );
      });
    await expect(runSeedSyntheticCommand(argv, {})).rejects.toMatchObject({ name: 'TimeoutError' });
    expect(execute).toHaveBeenCalledOnce();
    expect(shutdownTelemetry).toHaveBeenCalledOnce();
  });

  it('rejects arguments before infrastructure and still shuts down telemetry', async () => {
    await expect(runSeedSyntheticCommand([...argv, '--all'], {})).rejects.toThrow(
      'Synthetic seed takes no arguments.',
    );
    expect(NestFactory.createApplicationContext).not.toHaveBeenCalled();
    expect(shutdownTelemetry).toHaveBeenCalledOnce();
  });

  it('reports cleanup failure when collection succeeded', async () => {
    const { close } = setup();
    close.mockRejectedValue(new Error('context cleanup failed'));
    await expect(runSeedSyntheticCommand(argv, {})).rejects.toThrow('context cleanup failed');
    expect(shutdownTelemetry).toHaveBeenCalledOnce();
  });
});
