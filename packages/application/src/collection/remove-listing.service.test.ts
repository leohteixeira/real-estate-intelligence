import { describe, expect, it, vi } from 'vitest';
import { parseUuidV7, createSourceRegistration } from '@rei/domain';
import { RemoveListing } from './remove-listing.service.js';
import type {
  ListingSuppression,
  ListingSuppressionRepository,
} from './listing-suppression.port.js';
import type { SourceRegisterRepository } from './source-register.repository.js';
import { Transaction, type EventEnvelope, type TransactionRunner } from '../shared/index.js';

class Scope extends Transaction {
  public constructor() {
    super();
  }
}
function fixture() {
  let row: ListingSuppression | undefined;
  const steps: string[] = [];
  const repository: ListingSuppressionRepository = {
    isSuppressed: vi.fn(async () => !!row),
    lockAndCheck: vi.fn(async () => !!row),
    record: vi.fn(async (_tx, input) => {
      const created = !row;
      row ??= input;
      steps.push('suppressed');
      return { suppression: row, created };
    }),
    listObjectKeys: vi.fn(async () => ['synthetic/object']),
    eraseCollectedData: vi.fn(async () => {
      steps.push('erase');
    }),
    complete: vi.fn(async () => {
      row = { ...row!, completed: true };
      steps.push('completed');
    }),
  };
  const registration = createSourceRegistration({
    sourceId: 'synthetic-data',
    displayLabel: 'Synthetic data',
    category: 'synthetic-listing',
    enabled: true,
    enabledAt: '2026-10-10T00:00:00Z',
    permissions: {
      collectionAllowed: true,
      imageFetchingAllowed: true,
      listingTextDisplayAllowed: true,
    },
    review: { outcome: 'not-required', reviewedAt: null, evidence: 'Repository fixture.' },
    access: { method: 'repository-fixture', detail: 'Checked-in fixture.' },
    rate: { status: 'not-applicable', limit: null, windowSeconds: null },
    licence: { status: 'not-applicable', label: 'Synthetic data', url: null },
  });
  const sources: SourceRegisterRepository = {
    findById: vi.fn(async () => registration),
    listEnabled: vi.fn(),
    assertCollectible: vi.fn(),
    enableAtomically: vi.fn(),
    holdAtomically: vi.fn(),
    clearHoldAfterReview: vi.fn(),
  };
  const snapshots = {
    delete: vi.fn(async () => {
      expect(row).toMatchObject({ completed: false });
      steps.push('delete');
    }),
  };
  const copies = {
    eraseListingCopies: vi.fn(async () => {
      steps.push('copies');
    }),
  };
  const transactions: TransactionRunner = {
    runInTransaction: async (work, signal) => {
      signal?.throwIfAborted();
      return work(new Scope());
    },
  };
  let id = 0;
  const events: EventEnvelope[] = [];
  const service = new RemoveListing(
    repository,
    sources,
    snapshots,
    [copies],
    transactions,
    {
      generate: async () =>
        parseUuidV7(`0199c8f2-2394-7000-8000-${String(++id).padStart(12, '0')}`),
    },
    { now: () => '2026-10-25T00:00:00Z' },
    {
      append: async (_tx, batch) => {
        events.push(...batch);
        steps.push('event');
      },
    },
  );
  return { service, repository, sources, snapshots, copies, events, steps };
}
describe('RemoveListing', () => {
  it('commits suppression and one minimal event before deleting, and replays a completed removal', async () => {
    const f = fixture();
    const first = await f.service.execute(
      'synthetic-data',
      'SYN-SP-0001',
      null,
      AbortSignal.timeout(1000),
    );
    expect(first.completed).toBe(true);
    expect(f.steps).toEqual(['suppressed', 'event', 'delete', 'copies', 'erase', 'completed']);
    const replay = await f.service.execute(
      'synthetic-data',
      'SYN-SP-0001',
      null,
      AbortSignal.timeout(1000),
    );
    expect(replay).toEqual(first);
    expect(f.events).toHaveLength(1);
    expect(f.events[0]?.payload).toEqual({
      sourceId: 'synthetic-data',
      sourceListingId: 'SYN-SP-0001',
    });
    expect(f.snapshots.delete).toHaveBeenCalledOnce();
  });
  it('keeps suppression on deletion failure and resumes without publishing another event', async () => {
    const f = fixture();
    f.snapshots.delete.mockRejectedValueOnce(new Error('controlled storage failure'));
    await expect(
      f.service.execute('synthetic-data', 'absent-listing', null, AbortSignal.timeout(1000)),
    ).rejects.toThrow('controlled storage failure');
    expect(
      await f.repository.isSuppressed(
        { sourceId: 'synthetic-data', sourceListingId: 'absent-listing' },
        AbortSignal.timeout(1000),
      ),
    ).toBe(true);
    expect(f.repository.complete).not.toHaveBeenCalled();
    const resumed = await f.service.execute(
      'synthetic-data',
      'absent-listing',
      null,
      AbortSignal.timeout(1000),
    );
    expect(resumed.completed).toBe(true);
    expect(f.events).toHaveLength(1);
  });
  it('does not claim completion when cancellation follows durable suppression', async () => {
    const f = fixture();
    const controller = new AbortController();
    f.snapshots.delete.mockImplementationOnce(async () => {
      controller.abort(new Error('interrupted'));
      throw controller.signal.reason;
    });
    await expect(
      f.service.execute('synthetic-data', 'listing-1', null, controller.signal),
    ).rejects.toThrow('interrupted');
    expect(f.repository.complete).not.toHaveBeenCalled();
    expect(f.events).toHaveLength(1);
    expect(
      (await f.service.execute('synthetic-data', 'listing-1', null, AbortSignal.timeout(1000)))
        .completed,
    ).toBe(true);
  });
  it('rejects unsafe identity and unknown sources before suppression', async () => {
    const f = fixture();
    await expect(
      f.service.execute('../source', 'listing', null, AbortSignal.timeout(1000)),
    ).rejects.toThrow();
    vi.mocked(f.sources.findById).mockResolvedValue(null);
    await expect(
      f.service.execute('unknown-source', 'listing', null, AbortSignal.timeout(1000)),
    ).rejects.toMatchObject({ kind: 'rejected' });
    expect(f.repository.record).not.toHaveBeenCalled();
  });
});
