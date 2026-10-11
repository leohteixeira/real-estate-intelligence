import {
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
import { CollectSourceOnce } from './collect-source-once.service.js';
import type {
  CollectionExecutionResult,
  CollectionRunRepository,
  PersistCompletedCollectionInput,
} from './collection-run.repository.js';
import type { ListingSource, RawListingDocument } from './listing-source.port.js';
import { ListingSourceAccessRefusal } from './listing-source.port.js';
import type { RawSnapshotStore } from './raw-snapshot-store.port.js';
import type { SourceRegisterRepository } from './source-register.repository.js';
import type { SnapshotSanitizer } from './snapshot-sanitizer.port.js';

const IDS = [
  '0199c8f2-2394-7ba0-8f9e-286378779210',
  '0199c8f2-2394-7ba0-8f9e-286378779211',
  '0199c8f2-2394-7ba0-8f9e-286378779212',
  '0199c8f2-2394-7ba0-8f9e-286378779213',
  '0199c8f2-2394-7ba0-8f9e-286378779214',
  '0199c8f2-2394-7ba0-8f9e-286378779215',
  '0199c8f2-2394-7ba0-8f9e-286378779216',
  '0199c8f2-2394-7ba0-8f9e-286378779217',
] as const satisfies readonly UuidV7[];
const HASH = `sha256:${'1'.repeat(64)}` as Sha256Hash;
const MANIFEST_HASH =
  'sha256:6e2051774fff4949c7cd982e1fe1b64207f46ab57ae9ed6eb4111ea690f76305' as Sha256Hash;
const TRACE: TraceContext = {
  traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
};
const DOCUMENT: RawListingDocument = {
  sourceId: 'synthetic-data',
  sourceListingId: 'SYN-SP-0001',
  sourceUrl: 'https://synthetic.invalid/listings/SYN-SP-0001',
  observedAt: '2026-10-10T11:59:59.000Z',
  mediaType: 'application/json',
  bytes: new TextEncoder().encode('{"fixture":true}'),
};
const LISTING: CollectedListing = {
  propertyType: 'apartment',
  askingPriceMinorUnits: 78_500_000,
  currency: 'BRL',
  areaSquareMeters: 82.5,
  bedrooms: 2,
  bathrooms: 2,
  parkingSpaces: 1,
  features: ['balcony'],
  location: {
    city: 'São Paulo',
    stateCode: 'SP',
    neighborhood: 'Bela Vista',
    street: 'Avenida Exemplo',
  },
  listedAt: '2026-10-09T15:30:00.000Z',
  advertiser: { type: 'agency', agencyName: 'Synthetic Realty Ltda.' },
  maskedDescription: 'Synthetic listing with contact details removed.',
  imageFingerprints: ['fixture-fingerprint:v1:synthetic-001'],
};

function result(overrides: Partial<CollectionExecutionResult> = {}): CollectionExecutionResult {
  return {
    operationKey: 'operation-1',
    sourceId: 'synthetic-data',
    runId: IDS[0],
    snapshotId: IDS[1],
    parsedEventId: IDS[2],
    completedEventId: IDS[3],
    contentHash: HASH,
    objectKey: `synthetic/sha256/${'1'.repeat(64)}.json`,
    replayed: false,
    ...overrides,
  };
}

function completedRun(sourceId = 'synthetic-data', observedCount = 1): CollectionRunState {
  return advanceCollectionRun(
    createRunningCollectionRun({
      operationKey: 'operation-1',
      runId: IDS[0],
      sourceId,
      startedAt: '2026-10-10T11:59:58.000Z',
    }),
    {
      expectedOrdinal: 0,
      expectedCursor: null,
      nextCursor: null,
      checkpointedAt: '2026-10-10T12:00:00.000Z',
      observedDelta: observedCount,
      exhausted: true,
      completedAt: '2026-10-10T12:00:00.000Z',
      manifestHash: MANIFEST_HASH,
      completedEventId: IDS[3],
    },
  );
}

function fixture(
  options: {
    replay?: CollectionExecutionResult;
    run?: CollectionRunState | null;
    enabled?: boolean;
    document?: RawListingDocument;
    sanitizer?: SnapshotSanitizer;
  } = {},
) {
  const calls: string[] = [];
  const transaction = {} as Transaction;
  const events: EventEnvelope[][] = [];
  const source: ListingSource = {
    fetchPage: vi.fn(async () => {
      calls.push('fetch');
      return { documents: [options.document ?? DOCUMENT], nextCursor: null, exhausted: true };
    }),
    parse: vi.fn(async () => {
      calls.push('parse');
      return LISTING;
    }),
  };
  const snapshots: RawSnapshotStore = {
    store: vi.fn(async (input) => {
      calls.push('store');
      return {
        contentHash: HASH,
        objectKey: `synthetic/sha256/${'1'.repeat(64)}.json`,
        byteLength: input.bytes.byteLength,
        mediaType: input.mediaType,
      };
    }),
  };
  let persistedInput: PersistCompletedCollectionInput | undefined;
  const sources: SourceRegisterRepository = {
    holdAtomically: vi.fn(),
    clearHoldAfterReview: vi.fn(),
    assertCollectible: vi.fn(async () => undefined),
    findById: vi.fn(async () =>
      createSourceRegistration({
        sourceId: 'synthetic-data',
        displayLabel: 'Labelled synthetic fixture',
        category: 'synthetic-listing',
        enabled: options.enabled ?? true,
        enabledAt: options.enabled === false ? null : '2026-10-10T00:00:00Z',
        permissions: {
          collectionAllowed: options.enabled ?? true,
          imageFetchingAllowed: true,
          listingTextDisplayAllowed: true,
        },
        review: { outcome: 'not-required', reviewedAt: null, evidence: 'Fixture.' },
        access: { method: 'repository-fixture', detail: 'Checked-in fixture.' },
        rate: { status: 'not-applicable', limit: null, windowSeconds: null },
        licence: { status: 'not-applicable', label: 'Synthetic data', url: null },
      }),
    ),
    enableAtomically: vi.fn(),
    listEnabled: vi.fn(async () => []),
  };
  const runs: CollectionRunRepository = {
    loadRunByOperationKeyInTransaction: vi.fn(async () => options.run ?? null),
    withSourceAdmission: vi.fn(async (_transaction, _sourceId, work) => work(null)),
    appendCompletedEvidence: vi.fn(async () => undefined),
    appendParsedEvidence: vi.fn(async () => {
      calls.push('evidence');
    }),
    fail: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    findByOperationKey: vi.fn(async () => options.replay ?? null),
    loadRunByOperationKey: vi.fn(async () =>
      options.run === undefined
        ? options.replay
          ? completedRun(options.replay.sourceId)
          : null
        : options.run,
    ),
    startOrLoad: vi.fn(async (_transaction, input) => {
      calls.push('start');
      return options.run ?? createRunningCollectionRun(input);
    }),
    listObservations: vi.fn(),
    lockRunForPage: vi.fn(),
    commitPage: vi.fn(),
    persistCompleted: vi.fn(async (_transaction, input) => {
      calls.push('persist');
      persistedInput = input;
      return {
        created: true,
        result: result({
          sourceId: input.sourceId,
          operationKey: input.operationKey,
          runId: input.runId,
          snapshotId: input.snapshotId,
          parsedEventId: input.parsedEventId,
          completedEventId: input.completedEventId,
        }),
      };
    }),
  };
  const transactions: TransactionRunner = {
    runInTransaction: vi.fn(async (work) => {
      calls.push('transaction');
      return work(transaction);
    }),
  };
  let identifierIndex = 0;
  const identifiers: UuidV7Generator = {
    generate: vi.fn(async () => IDS[identifierIndex++]!),
  };
  const clock: Clock = {
    now: vi
      .fn()
      .mockReturnValueOnce('2026-10-10T11:59:58.000Z')
      .mockReturnValue('2026-10-10T12:00:00.000Z'),
  };
  const outbox: OutboxAppendPort = {
    append: vi.fn(async (_transaction, appended) => {
      calls.push('outbox');
      events.push([...appended]);
    }),
  };
  const service = new CollectSourceOnce(
    source,
    snapshots,
    sources,
    runs,
    transactions,
    identifiers,
    clock,
    outbox,
    options.sanitizer,
  );
  return {
    service,
    transaction,
    calls,
    source,
    snapshots,
    runs,
    sources,
    transactions,
    outbox,
    events,
    persistedInput: () => persistedInput,
  };
}

describe('CollectSourceOnce', () => {
  it('replays a concurrent completion after an empty initial lookup without external work', async () => {
    const context = fixture({ replay: result() });
    vi.mocked(context.runs.loadRunByOperationKey).mockResolvedValueOnce(null);
    vi.mocked(context.runs.loadRunByOperationKeyInTransaction).mockResolvedValue(completedRun());
    await expect(
      context.service.execute('synthetic-data', 'operation-1', null, new AbortController().signal),
    ).resolves.toEqual({ ...result(), replayed: true });
    expect(context.source.fetchPage).not.toHaveBeenCalled();
    expect(context.snapshots.store).not.toHaveBeenCalled();
    expect(context.source.parse).not.toHaveBeenCalled();
    expect(context.runs.startOrLoad).not.toHaveBeenCalled();
    expect(context.outbox.append).not.toHaveBeenCalled();
  });

  it('rejects an incompatible completion discovered at admission', async () => {
    const context = fixture({ replay: result() });
    vi.mocked(context.runs.loadRunByOperationKey).mockResolvedValueOnce(null);
    vi.mocked(context.runs.loadRunByOperationKeyInTransaction).mockResolvedValue(
      completedRun('synthetic-data', 2),
    );
    await expect(
      context.service.execute('synthetic-data', 'operation-1', null, new AbortController().signal),
    ).rejects.toMatchObject({ kind: 'rejected' });
    expect(context.source.fetchPage).not.toHaveBeenCalled();
  });
  it.each(['source', 'storage'] as const)(
    'recovers a combined command timeout during %s even when mapped to cancelled',
    async (dependency) => {
      const context = fixture();
      const shutdown = new AbortController();
      const combined = AbortSignal.any([shutdown.signal, AbortSignal.timeout(15)]);
      const interrupted = async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 30));
        expect(combined.aborted).toBe(true);
        throw new ExternalFailure({ kind: 'cancelled', operation: dependency });
      };
      if (dependency === 'source')
        vi.mocked(context.source.fetchPage).mockImplementationOnce(interrupted);
      else vi.mocked(context.snapshots.store).mockImplementationOnce(interrupted);
      await expect(
        context.service.execute('synthetic-data', 'operation-1', null, combined),
      ).rejects.toMatchObject({ kind: 'cancelled' });
      expect(context.runs.fail).not.toHaveBeenCalled();
      expect(context.runs.appendParsedEvidence).not.toHaveBeenCalled();
      expect(context.runs.appendCompletedEvidence).not.toHaveBeenCalled();
      const boundary = createRunningCollectionRun(
        vi.mocked(context.runs.startOrLoad).mock.calls[0]![1],
      );
      vi.mocked(context.runs.loadRunByOperationKey).mockResolvedValue(boundary);
      vi.mocked(context.runs.loadRunByOperationKeyInTransaction).mockResolvedValue(boundary);
      await context.service.execute(
        'synthetic-data',
        'operation-1',
        null,
        new AbortController().signal,
      );
      expect(context.persistedInput()).toMatchObject({
        runId: boundary.runId,
        startedAt: boundary.startedAt,
      });
      expect(context.runs.appendCompletedEvidence).toHaveBeenCalledOnce();
    },
  );
  it('terminates a deterministic refusal without original or complete publications', async () => {
    const context = fixture();
    vi.mocked(context.source.fetchPage).mockResolvedValue({
      documents: [],
      nextCursor: null,
      exhausted: true,
    });
    await expect(
      context.service.execute('synthetic-data', 'owned-empty', null, new AbortController().signal),
    ).rejects.toMatchObject({ kind: 'rejected' });
    expect(context.runs.fail).toHaveBeenCalledWith(context.transaction, IDS[0]);
    expect(context.runs.appendParsedEvidence).not.toHaveBeenCalled();
    expect(context.runs.appendCompletedEvidence).not.toHaveBeenCalled();
    expect(context.outbox.append).not.toHaveBeenCalled();
  });
  it('persists terminal cleanup with an independent bounded signal after request cancellation', async () => {
    const context = fixture();
    const controller = new AbortController();
    vi.mocked(context.source.fetchPage).mockImplementation(async () => {
      controller.abort(new Error('owned request cancellation'));
      controller.signal.throwIfAborted();
      throw new Error('unreachable');
    });
    await expect(
      context.service.execute('synthetic-data', 'owned-cancelled', null, controller.signal),
    ).rejects.toThrow('owned request cancellation');
    expect(context.runs.fail).toHaveBeenCalledOnce();
    const cleanupSignal = vi.mocked(context.transactions.runInTransaction).mock.calls.at(-1)?.[1];
    expect(cleanupSignal).not.toBe(controller.signal);
    expect(cleanupSignal?.aborted).toBe(false);
    expect(context.outbox.append).not.toHaveBeenCalled();
  });
  it('resumes an interrupted same-source boundary with the original run ID and start time', async () => {
    const run = createRunningCollectionRun({
      operationKey: 'operation-1',
      runId: IDS[0],
      sourceId: 'synthetic-data',
      startedAt: '2026-10-09T11:59:58.000Z',
    });
    const context = fixture({ run });
    await context.service.execute(
      'synthetic-data',
      'operation-1',
      null,
      new AbortController().signal,
    );
    expect(context.persistedInput()).toMatchObject({ runId: run.runId, startedAt: run.startedAt });
    expect(context.calls.indexOf('start')).toBeLessThan(context.calls.indexOf('fetch'));
  });
  it('registers chronology while acquisition is held and before storage or parsing', async () => {
    const context = fixture();
    let release!: () => void;
    let entered!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetched = new Promise<void>((resolve) => {
      entered = resolve;
    });
    vi.mocked(context.source.fetchPage).mockImplementation(async () => {
      entered();
      await held;
      return { documents: [DOCUMENT], nextCursor: null, exhausted: true };
    });
    const execution = context.service.execute(
      'synthetic-data',
      'held-once',
      null,
      new AbortController().signal,
    );
    await fetched;
    expect(context.runs.startOrLoad).toHaveBeenCalledOnce();
    expect(context.snapshots.store).not.toHaveBeenCalled();
    release();
    await execution;
  });
  it.each(['success', 'rejected', 'missing'] as const)(
    'enforces the application privacy seam for a real category: %s',
    async (outcome) => {
      const original = {
        ...DOCUMENT,
        sourceId: 'privacy-fixture',
        sourceUrl: 'https://fixture.invalid/1?private=value',
        bytes: new TextEncoder().encode('private source bytes'),
      };
      const safe = {
        ...original,
        sourceUrl: 'https://fixture.invalid/1',
        bytes: new TextEncoder().encode('sanitized bytes'),
      };
      const projected = { ...LISTING, maskedDescription: 'Sanitized parser facts.' };
      const sanitizeParsed = vi.fn(() => projected);
      const sanitize = vi.fn(() => {
        if (outcome === 'rejected')
          throw new ExternalFailure({
            kind: 'rejected',
            operation: 'collection.snapshot.sanitize',
          });
        return { document: safe, sanitizeParsed };
      });
      const context = fixture({
        document: original,
        ...(outcome === 'missing' ? {} : { sanitizer: { sanitize } }),
      });
      vi.mocked(context.sources.findById).mockResolvedValue(
        createSourceRegistration({
          sourceId: 'privacy-fixture',
          displayLabel: 'Local port fixture',
          category: 'listing',
          enabled: true,
          enabledAt: '2026-10-10T00:00:00Z',
          permissions: {
            collectionAllowed: true,
            imageFetchingAllowed: false,
            listingTextDisplayAllowed: false,
          },
          review: {
            outcome: 'allowed',
            reviewedAt: '2026-10-10T00:00:00Z',
            evidence: 'Local port fixture only.',
          },
          access: { method: 'remote-http', detail: 'No network adapter.' },
          rate: { status: 'configured', limit: 1, windowSeconds: 1 },
          licence: {
            status: 'licensed',
            label: 'Local fixture',
            url: 'https://fixture.invalid/licence',
          },
        }),
      );
      const execution = context.service.execute(
        'privacy-fixture',
        'privacy-once',
        null,
        new AbortController().signal,
      );
      if (outcome !== 'success') {
        await expect(execution).rejects.toMatchObject({
          kind: outcome === 'missing' ? 'forbidden' : 'rejected',
        });
        expect(context.snapshots.store).not.toHaveBeenCalled();
        expect(context.source.parse).not.toHaveBeenCalled();
        expect(context.events).toEqual([]);
        return;
      }
      await execution;
      expect(sanitize).toHaveBeenCalledWith(original);
      expect(context.snapshots.store).toHaveBeenCalledWith(
        expect.objectContaining({
          synthetic: false,
          bytes: safe.bytes,
          acquisitionId: JSON.stringify([
            'privacy-once',
            'privacy-fixture',
            original.sourceListingId,
          ]),
        }),
        expect.any(AbortSignal),
        undefined,
      );
      expect(context.source.parse).toHaveBeenCalledWith(safe, expect.any(AbortSignal));
      expect(sanitizeParsed).toHaveBeenCalledWith(LISTING);
      expect(context.persistedInput()?.sourceUrl).toBe(safe.sourceUrl);
      expect(context.persistedInput()?.imageFingerprints).toEqual(projected.imageFingerprints);
      expect(context.events[0]?.[0]?.payload).toMatchObject({ listing: projected });
    },
  );
  it('persists the pre-I/O run and pauses it on a durable source refusal without snapshots', async () => {
    const context = fixture();
    vi.mocked(context.source.fetchPage).mockRejectedValueOnce(
      new ListingSourceAccessRefusal('login-wall'),
    );
    vi.mocked(context.sources.holdAtomically).mockResolvedValueOnce(
      createSourceRegistration({
        ...(await context.sources.findById('synthetic-data'))!,
        enabled: false,
        enabledAt: null,
        hold: { reason: 'login-wall', heldAt: '2026-10-10T12:00:00Z' },
      }),
    );
    await expect(
      context.service.execute(
        'synthetic-data',
        'one-shot-block',
        null,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ reason: 'login-wall' });
    expect(context.sources.holdAtomically).toHaveBeenCalledOnce();
    expect(context.snapshots.store).not.toHaveBeenCalled();
    expect(context.source.parse).not.toHaveBeenCalled();
    expect(context.runs.startOrLoad).toHaveBeenCalledOnce();
    expect(context.runs.pause).toHaveBeenCalledOnce();
    expect(context.events).toEqual([]);
  });

  it('forwards the absolute operation deadline to acquisition and storage', async () => {
    const context = fixture();
    const signal = new AbortController().signal;
    const deadlineAt = Date.now() + 5_000;
    await context.service.execute('synthetic-data', 'deadline-proof', null, signal, deadlineAt);
    expect(context.source.fetchPage).toHaveBeenCalledWith(
      'synthetic-data',
      null,
      signal,
      deadlineAt,
    );
    expect(context.snapshots.store).toHaveBeenCalledWith(expect.any(Object), signal, deadlineAt);
  });
  it('stores exact bytes before parsing and atomically appends parsed and completed events', async () => {
    const context = fixture();
    const signal = new AbortController().signal;

    await expect(
      context.service.execute('synthetic-data', 'operation-1', TRACE, signal),
    ).resolves.toEqual(result());

    expect(context.runs.loadRunByOperationKey).toHaveBeenCalledWith('operation-1', signal);
    expect(context.runs.findByOperationKey).not.toHaveBeenCalled();
    expect(context.sources.findById).toHaveBeenCalledWith('synthetic-data', signal);
    expect(context.transactions.runInTransaction).toHaveBeenCalledWith(
      expect.any(Function),
      signal,
    );
    expect(context.calls).toEqual([
      'transaction',
      'start',
      'fetch',
      'store',
      'parse',
      'transaction',
      'persist',
      'evidence',
      'outbox',
    ]);
    expect(context.runs.appendParsedEvidence).toHaveBeenCalledWith(context.transaction, [
      context.events[0]![0],
    ]);
    expect(context.snapshots.store).toHaveBeenCalledWith(
      expect.objectContaining({ bytes: DOCUMENT.bytes, synthetic: true }),
      expect.any(AbortSignal),
      undefined,
    );
    expect(context.events[0]?.map((event) => event.type)).toEqual([
      'collection.snapshot.parsed',
      'collection.run.completed',
    ]);
    expect(
      context.events[0]?.every((event) => event.traceContext?.traceparent === TRACE.traceparent),
    ).toBe(true);
    expect(
      context.events[0]?.find((event) => event.type === 'collection.snapshot.parsed'),
    ).toMatchObject({ payload: { snapshot: { contentHash: HASH } } });
    expect(
      context.events[0]?.find((event) => event.type === 'collection.run.completed'),
    ).toMatchObject({ payload: { manifestHash: MANIFEST_HASH } });
    expect(context.persistedInput()).toMatchObject({
      operationKey: 'operation-1',
      contentHash: HASH,
      manifestHash: MANIFEST_HASH,
      sourceListingId: DOCUMENT.sourceListingId,
    });
    expect(context.persistedInput()?.manifestHash).not.toBe(context.persistedInput()?.contentHash);
  });

  it('returns an existing result for an explicit operation-key replay without touching a source', async () => {
    const existing = result();
    const context = fixture({ replay: existing });

    await expect(
      context.service.execute('synthetic-data', 'operation-1', null, new AbortController().signal),
    ).resolves.toEqual({ ...existing, replayed: true });

    expect(context.source.fetchPage).not.toHaveBeenCalled();
    expect(context.snapshots.store).not.toHaveBeenCalled();
    expect(context.transactions.runInTransaction).not.toHaveBeenCalled();
  });

  it.each([
    [
      'running cross-source',
      createRunningCollectionRun({
        operationKey: 'operation-1',
        runId: IDS[0],
        sourceId: 'synthetic-portal-aurora',
        startedAt: '2026-10-10T11:59:58.000Z',
      }),
    ],
    ['completed cross-source', completedRun('synthetic-portal-aurora')],
    ['completed multi-observation', completedRun('synthetic-data', 2)],
  ])('rejects an existing %s operation before source or storage work', async (_name, run) => {
    const context = fixture({ run });

    await expect(
      context.service.execute('synthetic-data', 'operation-1', null, new AbortController().signal),
    ).rejects.toMatchObject({ kind: 'rejected', operation: 'collection.run.resume' });

    expect(context.runs.findByOperationKey).not.toHaveBeenCalled();
    expect(context.sources.findById).not.toHaveBeenCalled();
    expect(context.source.fetchPage).not.toHaveBeenCalled();
    expect(context.snapshots.store).not.toHaveBeenCalled();
  });

  it('rejects an unsafe source listing identity before storage, parsing, or persistence', async () => {
    const context = fixture({
      document: { ...DOCUMENT, sourceListingId: 'unsafe identity' },
    });

    await expect(
      context.service.execute(
        'synthetic-data',
        'operation-invalid',
        null,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ kind: 'rejected', operation: 'collection.source.fetch' });

    expect(context.snapshots.store).not.toHaveBeenCalled();
    expect(context.source.parse).not.toHaveBeenCalled();
    expect(context.runs.startOrLoad).toHaveBeenCalledOnce();
    expect(context.runs.persistCompleted).not.toHaveBeenCalled();
  });

  it('refuses a disabled or unknown source before fetching or creating an artifact', async () => {
    const context = fixture({ enabled: false });

    await expect(
      context.service.execute('synthetic-data', 'operation-1', null, new AbortController().signal),
    ).rejects.toMatchObject({ kind: 'forbidden', operation: 'collection.source.fetch' });
    expect(context.source.fetchPage).not.toHaveBeenCalled();
    expect(context.snapshots.store).not.toHaveBeenCalled();
  });

  it('keeps a retryable pre-I/O boundary and does not parse or complete when storage fails', async () => {
    const context = fixture();
    vi.mocked(context.snapshots.store).mockRejectedValue(
      new ExternalFailure({ kind: 'transient', operation: 'raw-snapshot.store' }),
    );

    await expect(
      context.service.execute('synthetic-data', 'operation-1', null, new AbortController().signal),
    ).rejects.toMatchObject({ kind: 'transient', operation: 'raw-snapshot.store' });
    expect(context.source.parse).not.toHaveBeenCalled();
    expect(context.runs.startOrLoad).toHaveBeenCalledOnce();
    expect(context.runs.persistCompleted).not.toHaveBeenCalled();
    expect(context.runs.fail).not.toHaveBeenCalled();
  });

  it('propagates a database failure after storage without publishing outside the transaction', async () => {
    const context = fixture();
    vi.mocked(context.runs.persistCompleted).mockRejectedValue(new Error('database unavailable'));

    await expect(
      context.service.execute('synthetic-data', 'operation-1', null, new AbortController().signal),
    ).rejects.toThrow('database unavailable');
    expect(context.snapshots.store).toHaveBeenCalledOnce();
    expect(context.outbox.append).not.toHaveBeenCalled();
    expect(context.runs.appendParsedEvidence).not.toHaveBeenCalled();
  });

  it('rejects a concurrent persistence winner bound to another source without appending events', async () => {
    const context = fixture();
    vi.mocked(context.runs.persistCompleted).mockResolvedValue({
      created: false,
      result: result({ sourceId: 'synthetic-portal-aurora' }),
    });

    await expect(
      context.service.execute('synthetic-data', 'operation-1', null, new AbortController().signal),
    ).rejects.toMatchObject({ kind: 'rejected', operation: 'collection.run.resume' });

    expect(context.outbox.append).not.toHaveBeenCalled();
  });

  it('reuses the immutable object identity for a different operation key', async () => {
    const context = fixture();

    await context.service.execute(
      'synthetic-data',
      'operation-1',
      null,
      new AbortController().signal,
    );
    vi.mocked(context.runs.persistCompleted).mockImplementation(async (_transaction, input) => ({
      created: true,
      result: result({
        operationKey: input.operationKey,
        runId: input.runId,
        snapshotId: input.snapshotId,
        parsedEventId: input.parsedEventId,
        completedEventId: input.completedEventId,
      }),
    }));
    await context.service.execute(
      'synthetic-data',
      'operation-2',
      null,
      new AbortController().signal,
    );

    expect(context.snapshots.store).toHaveBeenCalledTimes(2);
    await expect(vi.mocked(context.snapshots.store).mock.results[0]?.value).resolves.toMatchObject({
      contentHash: HASH,
    });
    await expect(vi.mocked(context.snapshots.store).mock.results[1]?.value).resolves.toMatchObject({
      contentHash: HASH,
    });
    expect(context.runs.persistCompleted).toHaveBeenCalledTimes(2);
  });

  it('propagates cancellation before source work starts', async () => {
    const context = fixture();
    const controller = new AbortController();
    controller.abort(new Error('command cancelled'));

    await expect(
      context.service.execute('synthetic-data', 'operation-1', null, controller.signal),
    ).rejects.toThrow('command cancelled');
    expect(context.runs.findByOperationKey).not.toHaveBeenCalled();
    expect(context.runs.loadRunByOperationKey).not.toHaveBeenCalled();
  });
});
