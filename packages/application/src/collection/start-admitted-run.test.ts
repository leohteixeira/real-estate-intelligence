import { createRunningCollectionRun, type CollectionRunState, type UuidV7 } from '@rei/domain';
import { describe, expect, it, vi } from 'vitest';
import type { Transaction } from '../shared/index.js';
import type { CollectionRunRepository } from './collection-run.repository.js';
import { startAdmittedRun } from './start-admitted-run.js';

const LOW = '0199c8f2-2394-7ba0-8f9e-286378779210' as UuidV7;
const HIGH = '0199c8f2-2394-7ba0-8f9e-286378779211' as UuidV7;
const NEXT = '0199c8f2-2394-7ba0-8f9e-286378779212' as UuidV7;
const DATE = '2026-10-10T12:00:00.000Z';
const transaction = {} as Transaction;

function setup(frontier: Pick<CollectionRunState, 'startedAt' | 'runId'> | null = null) {
  const runs = {
    withSourceAdmission: vi.fn(async (_transaction, _sourceId, work) => work(frontier)),
    loadRunByOperationKeyInTransaction: vi.fn(async () => null),
    startOrLoad: vi.fn(async (_transaction, input) => createRunningCollectionRun(input)),
  } as unknown as CollectionRunRepository;
  const identifiers = { generate: vi.fn(async () => NEXT) };
  const clock = { now: vi.fn(() => DATE) };
  const assertSource = vi.fn(async () => undefined);
  const controller = new AbortController();
  const start = () =>
    startAdmittedRun(
      transaction,
      'synthetic-data',
      'owned-key',
      runs,
      identifiers,
      clock,
      assertSource,
      controller.signal,
    );
  return { runs, identifiers, clock, assertSource, controller, start };
}

describe('startAdmittedRun', () => {
  it('captures time and identity only after admission and authority checks', async () => {
    const context = setup();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.mocked(context.runs.withSourceAdmission).mockImplementation(async (_tx, _source, work) => {
      await gate;
      return work(null);
    });
    const result = context.start();
    expect(context.clock.now).not.toHaveBeenCalled();
    expect(context.identifiers.generate).not.toHaveBeenCalled();
    release();
    await expect(result).resolves.toMatchObject({ startedAt: DATE, runId: NEXT });
    expect(context.assertSource.mock.invocationCallOrder[0]).toBeLessThan(
      context.clock.now.mock.invocationCallOrder[0]!,
    );
  });

  it('keeps tied authentic time while regenerating an identity behind the admitted frontier', async () => {
    const context = setup({ startedAt: DATE, runId: HIGH });
    context.identifiers.generate.mockResolvedValueOnce(LOW).mockResolvedValueOnce(NEXT);
    await expect(context.start()).resolves.toMatchObject({ startedAt: DATE, runId: NEXT });
    expect(context.identifiers.generate).toHaveBeenCalledTimes(2);
  });

  it('bounds exhausted identity selection and leaves the key unregistered for recovery', async () => {
    const context = setup({ startedAt: DATE, runId: HIGH });
    context.identifiers.generate.mockResolvedValue(LOW);
    await expect(context.start()).rejects.toMatchObject({ kind: 'transient' });
    expect(context.identifiers.generate).toHaveBeenCalledTimes(32);
    expect(context.runs.startOrLoad).not.toHaveBeenCalled();
  });

  it('refuses a regressing clock without fabricating a later start', async () => {
    const context = setup({ startedAt: '2026-10-10T12:01:00.000Z', runId: HIGH });
    await expect(context.start()).rejects.toMatchObject({ kind: 'transient' });
    expect(context.runs.startOrLoad).not.toHaveBeenCalled();
  });

  it('preserves an existing retry boundary without recapturing time or identifiers', async () => {
    const context = setup({ startedAt: DATE, runId: HIGH });
    const retained = createRunningCollectionRun({
      operationKey: 'owned-key',
      sourceId: 'synthetic-data',
      startedAt: '2026-10-01T12:00:00.000Z',
      runId: LOW,
    });
    vi.mocked(context.runs.loadRunByOperationKeyInTransaction).mockResolvedValue(retained);
    await expect(context.start()).resolves.toBe(retained);
    expect(context.clock.now).not.toHaveBeenCalled();
    expect(context.identifiers.generate).not.toHaveBeenCalled();
  });

  it('honors cancellation after waiting without registering or capturing a boundary', async () => {
    const context = setup();
    vi.mocked(context.runs.withSourceAdmission).mockImplementation(async (_tx, _source, work) => {
      context.controller.abort(new Error('owned shutdown'));
      return work(null);
    });
    await expect(context.start()).rejects.toThrow('owned shutdown');
    expect(context.runs.startOrLoad).not.toHaveBeenCalled();
    expect(context.clock.now).not.toHaveBeenCalled();
  });

  it('rejects a foreign operation owner before recapturing or registering', async () => {
    const context = setup();
    vi.mocked(context.runs.loadRunByOperationKeyInTransaction).mockResolvedValue(
      createRunningCollectionRun({
        operationKey: 'owned-key',
        sourceId: 'synthetic-portal-aurora',
        startedAt: DATE,
        runId: LOW,
      }),
    );
    await expect(context.start()).rejects.toMatchObject({ kind: 'rejected' });
    expect(context.clock.now).not.toHaveBeenCalled();
  });
});
