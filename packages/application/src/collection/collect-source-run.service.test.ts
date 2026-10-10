import {
  StaleCollectionCheckpointError,
  advanceCollectionRun,
  createRunningCollectionRun,
  createSourceRegistration,
  type CollectedListing,
  type CollectionRunState,
  type Sha256Hash,
  type TraceContext,
  type UuidV7,
} from '@rei/domain';
import { describe, expect, it, vi } from 'vitest';

import type {
  Clock,
  EventEnvelope,
  OutboxAppendPort,
  Transaction,
  TransactionRunner,
  UuidV7Generator,
} from '../shared/index.js';
import { ExternalFailure } from '../shared/index.js';
import { CollectSourceRun } from './collect-source-run.service.js';
import type {
  CollectionRunRepository,
  CommitCollectionPageInput,
  PersistedCollectionObservation,
} from './collection-run.repository.js';
import type { ListingSource, RawListingDocument } from './listing-source.port.js';
import type { RawSnapshotStore } from './raw-snapshot-store.port.js';
import type { SourceRegisterRepository } from './source-register.repository.js';

const IDS = Array.from(
  { length: 12 },
  (_, index) => `0199c8f2-2394-7ba0-8f9e-${(286_378_779_210 + index).toString()}` as UuidV7,
);
const TRACE: TraceContext = {
  traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
};
const HASH = `sha256:${'1'.repeat(64)}` as Sha256Hash;
const LISTING: CollectedListing = {
  propertyType: 'apartment',
  askingPriceMinorUnits: 100,
  currency: 'BRL',
  areaSquareMeters: 50,
  bedrooms: 1,
  bathrooms: 1,
  parkingSpaces: 0,
  features: [],
  location: { city: 'São Paulo', stateCode: 'SP', neighborhood: 'Centro', street: 'Rua Um' },
  listedAt: '2026-10-09T00:00:00.000Z',
  advertiser: { type: 'private', agencyName: null },
  maskedDescription: 'Synthetic listing.',
  imageFingerprints: ['fixture:one'],
};

function document(sourceListingId: string): RawListingDocument {
  return {
    sourceId: 'synthetic-portal-aurora',
    sourceListingId,
    sourceUrl: `https://aurora.synthetic.invalid/listings/${sourceListingId}`,
    observedAt: '2026-10-10T00:00:00.000Z',
    mediaType: 'application/json',
    bytes: new TextEncoder().encode(JSON.stringify(LISTING)),
  };
}

function enabledSource() {
  return createSourceRegistration({
    sourceId: 'synthetic-portal-aurora',
    displayLabel: 'Synthetic data — Aurora',
    category: 'synthetic-listing',
    enabled: true,
    enabledAt: '2026-10-10T00:00:00.000Z',
    permissions: {
      collectionAllowed: true,
      imageFetchingAllowed: true,
      listingTextDisplayAllowed: true,
    },
    review: { outcome: 'not-required', reviewedAt: null, evidence: 'Repository fixture.' },
    access: { method: 'repository-fixture', detail: 'Checked-in deterministic data.' },
    rate: { status: 'not-applicable', limit: null, windowSeconds: null },
    licence: { status: 'not-applicable', label: 'Synthetic data', url: null },
  });
}

class RunRepositoryDouble implements CollectionRunRepository {
  public run: CollectionRunState | null = null;
  public observations: PersistedCollectionObservation[] = [];

  public async findByOperationKey() {
    return null;
  }

  public async persistCompleted(): Promise<never> {
    throw new Error('Legacy persistence must not be used.');
  }

  public async loadRunByOperationKey(operationKey: string) {
    return this.run?.operationKey === operationKey ? this.run : null;
  }

  public async startOrLoad(
    _transaction: Transaction,
    input: {
      operationKey: string;
      runId: UuidV7;
      sourceId: string;
      startedAt: string;
    },
  ) {
    this.run ??= createRunningCollectionRun(input);
    return this.run;
  }

  public async lockRunForPage(
    _transaction: Transaction,
    runId: UuidV7,
    expectedOrdinal: number,
    expectedCursor: string | null,
  ) {
    if (
      !this.run ||
      this.run.runId !== runId ||
      this.run.status !== 'running' ||
      this.run.checkpoint.ordinal !== expectedOrdinal ||
      this.run.checkpoint.cursor !== expectedCursor
    ) {
      throw new StaleCollectionCheckpointError();
    }
    return this.run;
  }

  public async listObservations() {
    return [...this.observations];
  }

  public async commitPage(_transaction: Transaction, input: CommitCollectionPageInput) {
    if (
      !this.run ||
      this.run.checkpoint.ordinal !== input.expectedOrdinal ||
      this.run.checkpoint.cursor !== input.expectedCursor
    ) {
      if (!this.run) throw new Error('Run missing.');
      return { committed: false, run: this.run };
    }
    this.observations.push(...input.observations);
    this.run = advanceCollectionRun(this.run, {
      expectedOrdinal: input.expectedOrdinal,
      expectedCursor: input.expectedCursor,
      nextCursor: input.nextCursor,
      checkpointedAt: input.checkpointedAt,
      observedDelta: input.observations.length,
      exhausted: input.exhausted,
      ...(input.completedAt === null ? {} : { completedAt: input.completedAt }),
      ...(input.manifestHash === null ? {} : { manifestHash: input.manifestHash }),
      ...(input.completedEventId === null ? {} : { completedEventId: input.completedEventId }),
    });
    return { committed: true, run: this.run };
  }
}

function fixture(
  pages = [
    { documents: [document('AUR-BV-001')], nextCursor: 'fixture:2026-10:1', exhausted: false },
    { documents: [document('AUR-PN-001')], nextCursor: 'fixture:2026-10:2', exhausted: true },
  ],
) {
  const order: string[] = [];
  const source: ListingSource = {
    fetchPage: vi.fn(async (_sourceId, cursor) => {
      order.push(`fetch:${cursor ?? 'null'}`);
      const page = pages.shift();
      if (!page) throw new Error('Unexpected source fetch.');
      return page;
    }),
    parse: vi.fn(async () => {
      order.push('parse');
      return LISTING;
    }),
  };
  const snapshots: RawSnapshotStore = {
    store: vi.fn(async (input) => {
      order.push('store');
      return {
        contentHash: HASH,
        objectKey: `synthetic/sha256/${Buffer.from(input.bytes).toString('hex')}.json`,
        byteLength: input.bytes.byteLength,
        mediaType: input.mediaType,
      };
    }),
  };
  const sources: SourceRegisterRepository = {
    findById: vi.fn(async () => enabledSource()),
    enableAtomically: vi.fn(),
    listEnabled: vi.fn(async () => []),
  };
  const runs = new RunRepositoryDouble();
  const transaction = {} as Transaction;
  const transactions: TransactionRunner = {
    runInTransaction: vi.fn(async (work) => {
      order.push('transaction');
      return work(transaction);
    }),
  };
  let id = 0;
  const identifiers: UuidV7Generator = { generate: vi.fn(async () => IDS[id++]!) };
  let tick = 0;
  const clock: Clock = {
    now: vi.fn(() => `2026-10-10T00:00:0${tick++}.000Z`),
  };
  const batches: EventEnvelope[][] = [];
  const outbox: OutboxAppendPort = {
    append: vi.fn(async (_transaction, events) => {
      order.push('outbox');
      batches.push([...events]);
    }),
  };
  return {
    service: new CollectSourceRun(
      source,
      snapshots,
      sources,
      runs,
      transactions,
      identifiers,
      clock,
      outbox,
    ),
    source,
    snapshots,
    sources,
    runs,
    transactions,
    identifiers,
    outbox,
    batches,
    order,
  };
}

describe('CollectSourceRun', () => {
  it('starts before fetch, stores before parse, commits each page, and completes canonically', async () => {
    const context = fixture();
    const signal = new AbortController().signal;
    const result = await context.service.execute(
      'synthetic-portal-aurora',
      'operation-1',
      TRACE,
      signal,
    );

    expect(result).toMatchObject({
      operationKey: 'operation-1',
      sourceId: 'synthetic-portal-aurora',
      observedCount: 2,
      parsedCount: 2,
      replayed: false,
    });
    expect(context.runs.observations.map(({ sourceListingId }) => sourceListingId)).toEqual([
      'AUR-BV-001',
      'AUR-PN-001',
    ]);
    expect(context.runs.run).toMatchObject({ status: 'completed', checkpoint: { ordinal: 2 } });
    expect(context.batches.map((batch) => batch.map(({ type }) => type))).toEqual([
      ['collection.snapshot.parsed'],
      ['collection.snapshot.parsed', 'collection.run.completed'],
    ]);
    expect(context.order.slice(0, 2)).toEqual(['transaction', 'fetch:null']);
    expect(context.order).toContain('fetch:fixture:2026-10:1');
    expect(context.order.indexOf('store')).toBeLessThan(context.order.indexOf('parse'));
  });

  it('returns a completed replay before authorization or any source, storage, ID, or transaction work', async () => {
    const context = fixture();
    const signal = new AbortController().signal;
    const first = await context.service.execute(
      'synthetic-portal-aurora',
      'operation-1',
      null,
      signal,
    );
    vi.clearAllMocks();
    const replay = await context.service.execute(
      'synthetic-portal-aurora',
      'operation-1',
      null,
      signal,
    );

    expect(replay).toEqual({ ...first, replayed: true });
    expect(context.sources.findById).not.toHaveBeenCalled();
    expect(context.source.fetchPage).not.toHaveBeenCalled();
    expect(context.snapshots.store).not.toHaveBeenCalled();
    expect(context.identifiers.generate).not.toHaveBeenCalled();
    expect(context.transactions.runInTransaction).not.toHaveBeenCalled();
    expect(context.outbox.append).not.toHaveBeenCalled();
  });

  it('rejects cross-source operation-key reuse without source work', async () => {
    const context = fixture();
    context.runs.run = createRunningCollectionRun({
      operationKey: 'operation-1',
      runId: IDS[0]!,
      sourceId: 'synthetic-portal-brisa',
      startedAt: '2026-10-10T00:00:00.000Z',
    });
    await expect(
      context.service.execute(
        'synthetic-portal-aurora',
        'operation-1',
        null,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ kind: 'rejected', operation: 'collection.run.resume' });
    expect(context.sources.findById).not.toHaveBeenCalled();
    expect(context.source.fetchPage).not.toHaveBeenCalled();
  });

  it.each([
    ['unknown', null],
    ['disabled', { ...enabledSource(), enabled: false as const, enabledAt: null }],
    [
      'collection-disallowed',
      {
        ...enabledSource(),
        permissions: { ...enabledSource().permissions, collectionAllowed: false },
      },
    ],
    ['non-listing', { ...enabledSource(), category: 'reference-geography' as const }],
  ])('refuses an %s source before creating a run or fetching a page', async (_name, source) => {
    const context = fixture();
    vi.mocked(context.sources.findById).mockResolvedValue(source);

    await expect(
      context.service.execute(
        'synthetic-portal-aurora',
        'operation-refused',
        null,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ kind: 'forbidden' });

    expect(context.runs.run).toBeNull();
    expect(context.source.fetchPage).not.toHaveBeenCalled();
    expect(context.snapshots.store).not.toHaveBeenCalled();
  });

  it('resumes from the committed cursor and includes the durable prefix in completion', async () => {
    const context = fixture([
      {
        documents: [document('AUR-PN-001')],
        nextCursor: 'fixture:2026-10:2',
        exhausted: true,
      },
    ]);
    context.runs.run = advanceCollectionRun(
      createRunningCollectionRun({
        operationKey: 'operation-resume',
        runId: IDS[0]!,
        sourceId: 'synthetic-portal-aurora',
        startedAt: '2026-10-10T00:00:00.000Z',
      }),
      {
        expectedOrdinal: 0,
        expectedCursor: null,
        nextCursor: 'fixture:2026-10:1',
        checkpointedAt: '2026-10-10T00:00:01.000Z',
        observedDelta: 1,
        exhausted: false,
      },
    );
    context.runs.observations.push({
      snapshotId: IDS[1]!,
      parsedEventId: IDS[2]!,
      sourceListingId: 'AUR-BV-001',
      sourceUrl: 'https://aurora.synthetic.invalid/listings/AUR-BV-001',
      observedAt: '2026-10-10T00:00:00.000Z',
      contentHash: HASH,
      objectKey: 'synthetic/sha256/committed.json',
    });

    await expect(
      context.service.execute(
        'synthetic-portal-aurora',
        'operation-resume',
        null,
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ observedCount: 2, parsedCount: 2 });

    expect(context.order).toContain('fetch:fixture:2026-10:1');
    expect(context.runs.observations.map(({ sourceListingId }) => sourceListingId)).toEqual([
      'AUR-BV-001',
      'AUR-PN-001',
    ]);
  });

  it.each([
    ['empty nonterminal', { documents: [], nextCursor: 'cursor-1', exhausted: false }],
    [
      'repeated cursor',
      { documents: [document('AUR-BV-001')], nextCursor: null, exhausted: false },
    ],
    [
      'wrong source',
      {
        documents: [{ ...document('AUR-BV-001'), sourceId: 'synthetic-portal-brisa' }],
        nextCursor: null,
        exhausted: true,
      },
    ],
    [
      'duplicate page identity',
      {
        documents: [document('AUR-BV-001'), document('AUR-BV-001')],
        nextCursor: null,
        exhausted: true,
      },
    ],
    [
      'unsafe cursor',
      {
        documents: [document('AUR-BV-001')],
        nextCursor: 'cursor with spaces',
        exhausted: true,
      },
    ],
    [
      'unsafe source-listing identity',
      {
        documents: [document('unsafe identity')],
        nextCursor: null,
        exhausted: true,
      },
    ],
  ])('rejects %s without storing or advancing the durable prefix', async (_name, page) => {
    const context = fixture([page]);
    await expect(
      context.service.execute(
        'synthetic-portal-aurora',
        'operation-1',
        null,
        new AbortController().signal,
      ),
    ).rejects.toBeInstanceOf(ExternalFailure);
    expect(context.snapshots.store).not.toHaveBeenCalled();
    expect(context.runs.run).toMatchObject({ status: 'running', checkpoint: { ordinal: 0 } });
    expect(context.runs.observations).toEqual([]);
  });

  it('leaves the checkpoint unchanged when storage fails before parse', async () => {
    const context = fixture();
    vi.mocked(context.snapshots.store).mockRejectedValue(
      new ExternalFailure({ kind: 'transient', operation: 'raw-snapshot.store' }),
    );
    await expect(
      context.service.execute(
        'synthetic-portal-aurora',
        'operation-1',
        null,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ kind: 'transient' });
    expect(context.source.parse).not.toHaveBeenCalled();
    expect(context.runs.run).toMatchObject({ checkpoint: { ordinal: 0 } });
    expect(context.outbox.append).not.toHaveBeenCalled();
  });

  it('leaves the checkpoint unchanged when parsing fails after durable raw storage', async () => {
    const context = fixture();
    vi.mocked(context.source.parse).mockRejectedValue(
      new ExternalFailure({ kind: 'rejected', operation: 'collection.source.parse' }),
    );

    await expect(
      context.service.execute(
        'synthetic-portal-aurora',
        'operation-1',
        null,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ kind: 'rejected', operation: 'collection.source.parse' });

    expect(context.snapshots.store).toHaveBeenCalledOnce();
    expect(context.runs.run).toMatchObject({ status: 'running', checkpoint: { ordinal: 0 } });
    expect(context.runs.observations).toEqual([]);
    expect(context.outbox.append).not.toHaveBeenCalled();
  });

  it('rolls back the page prefix when its transaction fails after storage and parsing', async () => {
    const context = fixture();
    let transactionNumber = 0;
    vi.mocked(context.transactions.runInTransaction).mockImplementation(async (work) => {
      transactionNumber += 1;
      if (transactionNumber === 1) return work({} as Transaction);
      const previousRun = context.runs.run;
      const previousObservations = [...context.runs.observations];
      try {
        await work({} as Transaction);
      } finally {
        context.runs.run = previousRun;
        context.runs.observations.splice(
          0,
          context.runs.observations.length,
          ...previousObservations,
        );
      }
      throw new Error('transaction rolled back');
    });

    await expect(
      context.service.execute(
        'synthetic-portal-aurora',
        'operation-rollback',
        null,
        new AbortController().signal,
      ),
    ).rejects.toThrow('transaction rolled back');

    expect(context.snapshots.store).toHaveBeenCalledOnce();
    expect(context.source.parse).toHaveBeenCalledOnce();
    expect(context.runs.run).toMatchObject({ status: 'running', checkpoint: { ordinal: 0 } });
    expect(context.runs.observations).toEqual([]);
  });

  it('rejects a conflicting identity from the committed prefix without advancing it', async () => {
    const context = fixture([
      {
        documents: [document('AUR-BV-001')],
        nextCursor: 'fixture:2026-10:2',
        exhausted: true,
      },
    ]);
    context.runs.run = advanceCollectionRun(
      createRunningCollectionRun({
        operationKey: 'operation-conflict',
        runId: IDS[0]!,
        sourceId: 'synthetic-portal-aurora',
        startedAt: '2026-10-10T00:00:00.000Z',
      }),
      {
        expectedOrdinal: 0,
        expectedCursor: null,
        nextCursor: 'fixture:2026-10:1',
        checkpointedAt: '2026-10-10T00:00:01.000Z',
        observedDelta: 1,
        exhausted: false,
      },
    );
    context.runs.observations.push({
      snapshotId: IDS[1]!,
      parsedEventId: IDS[2]!,
      sourceListingId: 'AUR-BV-001',
      sourceUrl: 'https://aurora.synthetic.invalid/listings/AUR-BV-001',
      observedAt: '2026-10-09T00:00:00.000Z',
      contentHash: `sha256:${'2'.repeat(64)}` as Sha256Hash,
      objectKey: 'synthetic/sha256/previous.json',
    });

    await expect(
      context.service.execute(
        'synthetic-portal-aurora',
        'operation-conflict',
        null,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ kind: 'rejected', operation: 'collection.run.commit-page' });

    expect(context.runs.run).toMatchObject({ status: 'running', checkpoint: { ordinal: 1 } });
    expect(context.runs.observations).toHaveLength(1);
  });

  it.each(['before-fetch', 'during-store', 'during-parse', 'during-transaction'] as const)(
    'propagates cancellation %s without advancing a page',
    async (stage) => {
      const context = fixture();
      const controller = new AbortController();
      if (stage === 'before-fetch') controller.abort(new Error('cancelled before fetch'));
      if (stage === 'during-store') {
        vi.mocked(context.snapshots.store).mockImplementation(async (_input, signal) => {
          controller.abort(new Error('cancelled during store'));
          signal.throwIfAborted();
          throw new Error('unreachable');
        });
      }
      if (stage === 'during-parse') {
        vi.mocked(context.source.parse).mockImplementation(async (_document, signal) => {
          controller.abort(new Error('cancelled during parse'));
          signal.throwIfAborted();
          throw new Error('unreachable');
        });
      }
      if (stage === 'during-transaction') {
        let transactionNumber = 0;
        vi.mocked(context.transactions.runInTransaction).mockImplementation(
          async (work, signal) => {
            transactionNumber += 1;
            if (transactionNumber === 1) return work({} as Transaction);
            controller.abort(new Error('cancelled during transaction'));
            signal?.throwIfAborted();
            throw new Error('unreachable');
          },
        );
      }

      await expect(
        context.service.execute(
          'synthetic-portal-aurora',
          `operation-${stage}`,
          null,
          controller.signal,
        ),
      ).rejects.toThrow(/cancelled/);

      if (stage === 'before-fetch') {
        expect(context.runs.run).toBeNull();
      } else {
        expect(context.runs.run).toMatchObject({ checkpoint: { ordinal: 0 } });
        expect(context.runs.observations).toEqual([]);
      }
    },
  );

  it('completes an empty terminal page with the canonical empty manifest', async () => {
    const context = fixture([{ documents: [], nextCursor: null, exhausted: true }]);

    await expect(
      context.service.execute(
        'synthetic-portal-aurora',
        'operation-empty',
        null,
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({
      observedCount: 0,
      parsedCount: 0,
      manifestHash: 'sha256:4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
    });

    expect(context.snapshots.store).not.toHaveBeenCalled();
    expect(context.source.parse).not.toHaveBeenCalled();
    expect(context.batches.map((batch) => batch.map(({ type }) => type))).toEqual([
      ['collection.run.completed'],
    ]);
  });

  it('reloads and returns the winning state when a contender advances the checkpoint first', async () => {
    const context = fixture();
    context.runs.run = createRunningCollectionRun({
      operationKey: 'operation-race',
      runId: IDS[0]!,
      sourceId: 'synthetic-portal-aurora',
      startedAt: '2026-10-10T00:00:00.000Z',
    });
    vi.spyOn(context.runs, 'lockRunForPage').mockImplementation(async () => {
      context.runs.run = advanceCollectionRun(context.runs.run!, {
        expectedOrdinal: 0,
        expectedCursor: null,
        nextCursor: null,
        checkpointedAt: '2026-10-10T00:00:01.000Z',
        observedDelta: 1,
        exhausted: true,
        completedAt: '2026-10-10T00:00:01.000Z',
        manifestHash: HASH,
        completedEventId: IDS[1]!,
      });
      throw new StaleCollectionCheckpointError();
    });

    await expect(
      context.service.execute(
        'synthetic-portal-aurora',
        'operation-race',
        null,
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({
      runId: IDS[0],
      observedCount: 1,
      parsedCount: 1,
      replayed: false,
    });

    expect(context.identifiers.generate).not.toHaveBeenCalled();
    expect(context.outbox.append).not.toHaveBeenCalled();
  });
});
