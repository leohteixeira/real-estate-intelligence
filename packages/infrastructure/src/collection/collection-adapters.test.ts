import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { OutboxAppendPort, RawListingDocument, Transaction } from '@rei/application';
import { CollectSourceOnce, ExternalFailure } from '@rei/application';
import {
  StaleCollectionCheckpointError,
  createSourceRegistration,
  type CollectedListing,
  type Sha256Hash,
} from '@rei/domain';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import {
  InMemoryCollectionRunRepository,
  InMemoryListingSource,
  InMemoryRawSnapshotStore,
  InMemorySourceRegisterRepository,
} from './in-memory-collection.adapters.js';
import { S3RawSnapshotStore } from './s3-raw-snapshot-store.js';
import {
  SYNTHETIC_LISTING_BYTES,
  SYNTHETIC_LISTING_SOURCE_ID,
  SyntheticListingSource,
} from './synthetic-listing-source.js';

const DOCUMENT: RawListingDocument = {
  sourceId: 'synthetic-data',
  sourceListingId: 'SYN-SP-0001',
  sourceUrl: 'https://synthetic.invalid/listings/SYN-SP-0001',
  observedAt: '2026-10-10T11:59:59.000Z',
  mediaType: 'application/json',
  bytes: SYNTHETIC_LISTING_BYTES,
};
const LISTING: CollectedListing = {
  propertyType: 'apartment',
  askingPriceMinorUnits: 1,
  currency: 'BRL',
  areaSquareMeters: 1,
  bedrooms: 0,
  bathrooms: 0,
  parkingSpaces: 0,
  features: [],
  location: { city: 'São Paulo', stateCode: 'SP', neighborhood: 'Centro', street: 'Rua Um' },
  listedAt: '2026-10-10T00:00:00.000Z',
  advertiser: { type: 'private', agencyName: null },
  maskedDescription: 'Synthetic listing.',
  imageFingerprints: ['fixture:v1'],
};

describe('SyntheticListingSource', () => {
  it('returns cloned exact bytes and parses only the privacy-reviewed listing shape', async () => {
    const source = new SyntheticListingSource();
    const page = await source.fetchPage(
      SYNTHETIC_LISTING_SOURCE_ID,
      null,
      new AbortController().signal,
    );
    const document = page.documents[0]!;

    expect(page).toMatchObject({ nextCursor: null, exhausted: true });
    expect(document.bytes).toEqual(SYNTHETIC_LISTING_BYTES);
    expect(document.bytes).not.toBe(SYNTHETIC_LISTING_BYTES);
    await expect(source.parse(document, new AbortController().signal)).resolves.toMatchObject({
      currency: 'BRL',
      maskedDescription: expect.stringContaining('[REDACTED]'),
    });
  });

  it('refuses unknown sources and invalid source bytes with closed failures', async () => {
    const source = new SyntheticListingSource();
    await expect(
      source.fetchPage('unknown-source', null, new AbortController().signal),
    ).rejects.toMatchObject({ kind: 'forbidden' });
    await expect(
      source.parse(
        { ...DOCUMENT, bytes: new TextEncoder().encode('{"phone":"5511999999999"}') },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ kind: 'rejected' });
  });

  it('maps cancellation before either source phase', async () => {
    const source = new SyntheticListingSource();
    const controller = new AbortController();
    controller.abort();
    await expect(
      source.fetchPage(SYNTHETIC_LISTING_SOURCE_ID, null, controller.signal),
    ).rejects.toMatchObject({ kind: 'cancelled' });
    await expect(source.parse(DOCUMENT, controller.signal)).rejects.toMatchObject({
      kind: 'cancelled',
    });
  });
});

describe('in-memory collection adapters', () => {
  it('replays authentic completion when another caller wins after a genuine empty lookup', async () => {
    let enterLookup!: () => void;
    let releaseLookup!: () => void;
    const entered = new Promise<void>((resolve) => {
      enterLookup = resolve;
    });
    const held = new Promise<void>((resolve) => {
      releaseLookup = resolve;
    });
    class HeldLookup extends InMemoryCollectionRunRepository {
      private first = true;
      public override async loadRunByOperationKey(operationKey: string) {
        const result = await super.loadRunByOperationKey(operationKey);
        if (this.first) {
          this.first = false;
          expect(result).toBeNull();
          enterLookup();
          await held;
        }
        return result;
      }
    }
    const repository = new HeldLookup();
    const source = new InMemoryListingSource(DOCUMENT, LISTING);
    const fetch = vi.spyOn(source, 'fetchPage');
    const parse = vi.spyOn(source, 'parse');
    const store = new InMemoryRawSnapshotStore();
    const storing = vi.spyOn(store, 'store');
    const register = new InMemorySourceRegisterRepository([
      createSourceRegistration({
        sourceId: 'synthetic-data',
        displayLabel: 'Owned replay fixture',
        category: 'synthetic-listing',
        enabled: true,
        enabledAt: '2026-10-10T00:00:00Z',
        permissions: {
          collectionAllowed: true,
          imageFetchingAllowed: false,
          listingTextDisplayAllowed: true,
        },
        review: { outcome: 'not-required', reviewedAt: null, evidence: 'Owned fixture.' },
        access: { method: 'repository-fixture', detail: 'Owned fixture.' },
        rate: { status: 'not-applicable', limit: null, windowSeconds: null },
        licence: { status: 'not-applicable', label: 'Synthetic', url: null },
      }),
    ]);
    const ids = [
      '0199c8f2-2394-7ba0-8f9e-286378779210',
      '0199c8f2-2394-7ba0-8f9e-286378779211',
      '0199c8f2-2394-7ba0-8f9e-286378779212',
      '0199c8f2-2394-7ba0-8f9e-286378779213',
    ] as const;
    let next = 0;
    const generate = vi.fn(async () => ids[next++]!);
    const append = vi.fn<OutboxAppendPort['append']>(async () => undefined);
    const service = new CollectSourceOnce(
      source,
      store,
      register,
      repository,
      { runInTransaction: async (work) => work({} as Transaction) },
      { generate },
      { now: () => DOCUMENT.observedAt },
      { append },
    );
    const first = service.execute(
      'synthetic-data',
      'owned-replay-race',
      null,
      new AbortController().signal,
    );
    await entered;
    const winner = await service.execute(
      'synthetic-data',
      'owned-replay-race',
      null,
      new AbortController().signal,
    );
    releaseLookup();
    await expect(first).resolves.toEqual({ ...winner, replayed: true });
    expect(winner.replayed).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(parse).toHaveBeenCalledTimes(1);
    expect(storing).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledTimes(4);
    expect(append).toHaveBeenCalledTimes(1);
    expect(append.mock.calls[0]?.[1]).toHaveLength(2);
    expect(repository.parsedEvidence).toHaveLength(1);
    expect(repository.completedEvidence).toHaveLength(1);
  });
  it('cancels an admission wait promptly without letting the following caller overtake the owner', async () => {
    const repository = new InMemoryCollectionRunRepository();
    const transaction = {} as Transaction;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = repository.withSourceAdmission(transaction, 'synthetic-data', async () => gate);
    const controller = new AbortController();
    const refusedWork = vi.fn(async () => undefined);
    const second = repository.withSourceAdmission(
      transaction,
      'synthetic-data',
      refusedWork,
      controller.signal,
    );
    controller.abort(new Error('owned cancellation'));
    await expect(second).rejects.toThrow('owned cancellation');
    let thirdEntered = false;
    const third = repository.withSourceAdmission(transaction, 'synthetic-data', async () => {
      thirdEntered = true;
    });
    await Promise.resolve();
    expect(thirdEntered).toBe(false);
    expect(refusedWork).not.toHaveBeenCalled();
    release();
    await first;
    await third;
    expect(thirdEntered).toBe(true);
    await expect(
      repository.withSourceAdmission(transaction, 'synthetic-data', refusedWork, controller.signal),
    ).rejects.toThrow('owned cancellation');
    const active = new AbortController();
    await expect(
      repository.withSourceAdmission(transaction, 'synthetic-data', async () => 1, active.signal),
    ).resolves.toBe(1);
  });
  it('serializes source admission, preserves its frontier and releases after refusal', async () => {
    const repository = new InMemoryCollectionRunRepository();
    const transaction = {} as Transaction;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let admitted = false;
    const first = repository.withSourceAdmission(
      transaction,
      'synthetic-data',
      async (frontier) => {
        expect(frontier).toBeNull();
        await repository.startOrLoad(transaction, {
          operationKey: 'owned-admission-1',
          sourceId: 'synthetic-data',
          startedAt: '2026-10-10T12:00:00.000Z',
          runId: '0199c8f2-2394-7ba0-8f9e-286378779210',
        });
        await gate;
      },
    );
    const second = repository.withSourceAdmission(
      transaction,
      'synthetic-data',
      async (frontier) => {
        admitted = true;
        expect(frontier?.runId).toBe('0199c8f2-2394-7ba0-8f9e-286378779210');
        throw new Error('owned refusal');
      },
    );
    await Promise.resolve();
    expect(admitted).toBe(false);
    release();
    await first;
    await expect(second).rejects.toThrow('owned refusal');
    await expect(
      repository.withSourceAdmission(
        transaction,
        'synthetic-data',
        async (frontier) => frontier?.startedAt,
      ),
    ).resolves.toBe('2026-10-10T12:00:00.000Z');
    await expect(
      repository.loadRunByOperationKeyInTransaction(transaction, 'owned-admission-1'),
    ).resolves.toMatchObject({ operationKey: 'owned-admission-1' });
  });
  it('holds a source until explicit review, preserves the first refusal, and still requires enablement', async () => {
    const source = createSourceRegistration({
      sourceId: 'synthetic-data',
      displayLabel: 'Synthetic fixture',
      category: 'synthetic-listing',
      enabled: true,
      enabledAt: '2026-10-10T00:00:00Z',
      permissions: {
        collectionAllowed: true,
        imageFetchingAllowed: false,
        listingTextDisplayAllowed: true,
      },
      review: { outcome: 'not-required', reviewedAt: null, evidence: 'Fixture.' },
      access: { method: 'repository-fixture', detail: 'Fixture.' },
      rate: { status: 'not-applicable', limit: null, windowSeconds: null },
      licence: { status: 'not-applicable', label: 'Synthetic', url: null },
    });
    const repository = new InMemorySourceRegisterRepository([source]);
    const transaction = {} as Transaction;
    const hold = { reason: 'block', heldAt: '2026-10-10T12:00:00Z' } as const;
    await expect(
      repository.assertCollectible(transaction, source.sourceId),
    ).resolves.toBeUndefined();
    await expect(repository.holdAtomically('missing', hold)).resolves.toBeNull();
    await expect(repository.clearHoldAfterReview('missing', hold.heldAt)).resolves.toBeNull();
    await expect(repository.holdAtomically(source.sourceId, hold)).resolves.toMatchObject({
      enabled: false,
      enabledAt: null,
      hold,
    });
    await expect(
      repository.holdAtomically(source.sourceId, {
        reason: 'captcha',
        heldAt: '2026-10-10T13:00:00Z',
      }),
    ).resolves.toMatchObject({ hold });
    await expect(repository.assertCollectible(transaction, source.sourceId)).rejects.toMatchObject({
      reason: 'block',
    });
    await expect(repository.assertCollectible(transaction, 'missing')).rejects.toThrow(
      'not collectible',
    );
    await expect(repository.enableAtomically(source.sourceId, hold.heldAt)).resolves.toBeNull();
    await expect(repository.listEnabled()).resolves.toEqual([]);
    await expect(repository.clearHoldAfterReview(source.sourceId, 'invalid')).rejects.toThrow(
      'instant',
    );
    await expect(
      repository.clearHoldAfterReview(source.sourceId, '2026-10-10T11:00:00Z'),
    ).rejects.toThrow('follow');
    await expect(
      repository.clearHoldAfterReview(source.sourceId, hold.heldAt),
    ).resolves.toMatchObject({ enabled: false, hold: null });
    await expect(repository.assertCollectible(transaction, source.sourceId)).rejects.toThrow(
      'not collectible',
    );
    await repository.clearHoldAfterReview(source.sourceId, hold.heldAt);
    await repository.enableAtomically(source.sourceId, hold.heldAt);
    await expect(
      repository.assertCollectible(transaction, source.sourceId),
    ).resolves.toBeUndefined();
    const controller = new AbortController();
    const reason = new Error('cancel');
    controller.abort(reason);
    await expect(repository.holdAtomically(source.sourceId, hold, controller.signal)).rejects.toBe(
      reason,
    );
    await expect(
      repository.clearHoldAfterReview(source.sourceId, hold.heldAt, controller.signal),
    ).rejects.toBe(reason);
  });

  it('pauses without terminal fields and resumes only explicitly using the same run identity', async () => {
    const repository = new InMemoryCollectionRunRepository();
    const transaction = {} as Transaction;
    const run = await repository.startOrLoad(transaction, {
      operationKey: 'pause-proof',
      runId: '0199c8f2-2394-7ba0-8f9e-286378779210',
      sourceId: 'synthetic-data',
      startedAt: '2026-10-10T00:00:00Z',
    });
    const hold = { reason: 'login-wall', heldAt: '2026-10-10T12:00:00Z' } as const;
    await expect(
      repository.pause(transaction, '0199c8f2-2394-7ba0-8f9e-286378779299', hold),
    ).rejects.toThrow('not found');
    await expect(
      repository.resume(transaction, '0199c8f2-2394-7ba0-8f9e-286378779299'),
    ).rejects.toThrow('not found');
    await expect(repository.resume(transaction, run.runId)).rejects.toThrow('paused');
    const paused = await repository.pause(transaction, run.runId, hold);
    expect(paused).toMatchObject({
      status: 'paused',
      pause: hold,
      completedAt: null,
      completedEventId: null,
      manifestHash: null,
    });
    await expect(repository.pause(transaction, run.runId, hold)).resolves.toEqual(paused);
    await expect(repository.resume(transaction, run.runId)).resolves.toEqual(run);
    expect(await repository.findByOperationKey(run.operationKey)).toBeNull();
  });
  it('clones source and object bytes and deduplicates content-addressed objects', async () => {
    const source = new InMemoryListingSource(DOCUMENT, LISTING);
    const store = new InMemoryRawSnapshotStore();
    const fetchedPage = await source.fetchPage(
      'synthetic-data',
      null,
      new AbortController().signal,
    );
    const fetched = fetchedPage.documents[0]!;
    const parsed = await source.parse(fetched, new AbortController().signal);
    const first = await store.store(
      {
        sourceId: 'synthetic-data',
        mediaType: 'application/json',
        synthetic: true,
        bytes: fetched.bytes,
      },
      new AbortController().signal,
    );
    const second = await store.store(
      {
        sourceId: 'synthetic-data',
        mediaType: 'application/json',
        synthetic: true,
        bytes: fetched.bytes,
      },
      new AbortController().signal,
    );

    expect(parsed).toEqual(LISTING);
    expect(parsed).not.toBe(LISTING);
    expect(first).toEqual(second);
    expect(store.size).toBe(1);
    expect(store.read(first.objectKey)).toEqual(fetched.bytes);
    expect(store.read('missing')).toBeUndefined();
  });

  it('stores and replays completed run results by operation key', async () => {
    const repository = new InMemoryCollectionRunRepository();
    const register = new InMemorySourceRegisterRepository([
      createSourceRegistration({
        sourceId: 'synthetic-data',
        displayLabel: 'Labelled synthetic fixture',
        category: 'synthetic-listing',
        enabled: true,
        enabledAt: '2026-10-10T00:00:00Z',
        permissions: {
          collectionAllowed: true,
          imageFetchingAllowed: true,
          listingTextDisplayAllowed: true,
        },
        review: { outcome: 'not-required', reviewedAt: null, evidence: 'Fixture.' },
        access: { method: 'repository-fixture', detail: 'Checked-in fixture.' },
        rate: { status: 'not-applicable', limit: null, windowSeconds: null },
        licence: { status: 'not-applicable', label: 'Synthetic data', url: null },
      }),
    ]);
    const input = {
      operationKey: 'operation-1',
      runId: '0199c8f2-2394-7ba0-8f9e-286378779210',
      snapshotId: '0199c8f2-2394-7ba0-8f9e-286378779211',
      parsedEventId: '0199c8f2-2394-7ba0-8f9e-286378779212',
      completedEventId: '0199c8f2-2394-7ba0-8f9e-286378779213',
      sourceId: 'synthetic-data',
      sourceListingId: 'SYN-SP-0001',
      sourceUrl: DOCUMENT.sourceUrl,
      observedAt: DOCUMENT.observedAt,
      startedAt: DOCUMENT.observedAt,
      completedAt: DOCUMENT.observedAt,
      contentHash: `sha256:${'1'.repeat(64)}`,
      objectKey: `synthetic/sha256/${'1'.repeat(64)}.json`,
      byteLength: 10,
      mediaType: 'application/json',
      manifestHash: `sha256:${'1'.repeat(64)}`,
    } as const;

    expect(await register.findById('synthetic-data')).toMatchObject({ enabled: true });
    expect(await register.findById('missing')).toBeNull();
    const first = await repository.persistCompleted({} as Transaction, input);
    const replay = await repository.persistCompleted({} as Transaction, input);
    expect(first.created).toBe(true);
    expect(replay).toEqual({ created: false, result: first.result });
    expect(await repository.findByOperationKey('operation-1')).toEqual(first.result);
    await expect(repository.loadRunByOperationKey('operation-1')).resolves.toEqual({
      pause: null,
      operationKey: input.operationKey,
      runId: input.runId,
      sourceId: 'synthetic-data',
      status: 'completed',
      startedAt: input.startedAt,
      checkpoint: {
        ordinal: 1,
        cursor: null,
        checkpointedAt: input.completedAt,
      },
      counts: { observed: 1, parsed: 1, changed: 0, suppressed: 0, failed: 0 },
      completedAt: input.completedAt,
      manifestHash: input.manifestHash,
      completedEventId: input.completedEventId,
    });
    await expect(repository.listObservations({} as Transaction, input.runId)).resolves.toEqual([
      expect.objectContaining({
        snapshotId: input.snapshotId,
        parsedEventId: input.parsedEventId,
        sourceListingId: input.sourceListingId,
      }),
    ]);
    await expect(
      repository.persistCompleted({} as Transaction, {
        ...input,
        sourceId: 'synthetic-portal-aurora',
      }),
    ).rejects.toThrow('different source');
  });

  it('models resumable checkpoint commits, stale contenders, and identity conflicts', async () => {
    const repository = new InMemoryCollectionRunRepository();
    const transaction = {} as Transaction;
    const runInput = {
      operationKey: 'operation-resumable',
      runId: '0199c8f2-2394-7ba0-8f9e-286378779220',
      sourceId: 'synthetic-portal-aurora',
      startedAt: '2026-10-10T00:00:00.000Z',
    } as const;
    const firstObservation = {
      snapshotId: '0199c8f2-2394-7ba0-8f9e-286378779221',
      parsedEventId: '0199c8f2-2394-7ba0-8f9e-286378779222',
      sourceListingId: 'AUR-BV-001',
      sourceUrl: 'https://aurora.synthetic.invalid/listings/AUR-BV-001',
      observedAt: '2026-10-10T00:00:00.000Z',
      contentHash: `sha256:${'1'.repeat(64)}`,
      objectKey: `synthetic/sha256/${'1'.repeat(64)}.json`,
      byteLength: 10,
      mediaType: 'application/json',
      outcome: 'parsed',
      changed: false,
      failureReason: null,
    } as const;

    await expect(repository.loadRunByOperationKey(runInput.operationKey)).resolves.toBeNull();
    const started = await repository.startOrLoad(transaction, runInput);
    await expect(
      repository.startOrLoad(transaction, { ...runInput, sourceId: 'ignored-by-idempotency' }),
    ).resolves.toBe(started);
    await expect(repository.lockRunForPage(transaction, started.runId, 0, null)).resolves.toBe(
      started,
    );
    await expect(repository.lockRunForPage(transaction, started.runId, 1, null)).rejects.toThrow(
      StaleCollectionCheckpointError,
    );
    await expect(
      repository.lockRunForPage(transaction, '0199c8f2-2394-7ba0-8f9e-286378779299', 0, null),
    ).rejects.toThrow('not found');

    const first = await repository.commitPage(transaction, {
      runId: started.runId,
      expectedOrdinal: 0,
      expectedCursor: null,
      nextCursor: 'fixture:2026-10:1',
      checkpointedAt: '2026-10-10T00:00:01.000Z',
      observations: [firstObservation],
      exhausted: false,
      completedAt: null,
      manifestHash: null,
      completedEventId: null,
    });
    expect(first).toMatchObject({ committed: true, run: { checkpoint: { ordinal: 1 } } });
    await expect(repository.listObservations(transaction, started.runId)).resolves.toEqual([
      expect.objectContaining({ sourceListingId: 'AUR-BV-001' }),
    ]);

    await expect(
      repository.commitPage(transaction, {
        runId: started.runId,
        expectedOrdinal: 0,
        expectedCursor: null,
        nextCursor: null,
        checkpointedAt: '2026-10-10T00:00:02.000Z',
        observations: [],
        exhausted: true,
        completedAt: '2026-10-10T00:00:02.000Z',
        manifestHash: `sha256:${'2'.repeat(64)}`,
        completedEventId: '0199c8f2-2394-7ba0-8f9e-286378779223',
      }),
    ).resolves.toMatchObject({ committed: false, run: { checkpoint: { ordinal: 1 } } });

    await expect(
      repository.commitPage(transaction, {
        runId: started.runId,
        expectedOrdinal: 1,
        expectedCursor: 'fixture:2026-10:1',
        nextCursor: null,
        checkpointedAt: '2026-10-10T00:00:02.000Z',
        observations: [firstObservation],
        exhausted: true,
        completedAt: '2026-10-10T00:00:02.000Z',
        manifestHash: `sha256:${'2'.repeat(64)}`,
        completedEventId: '0199c8f2-2394-7ba0-8f9e-286378779223',
      }),
    ).rejects.toThrow('identity conflicts');

    await expect(
      repository.commitPage(transaction, {
        runId: started.runId,
        expectedOrdinal: 1,
        expectedCursor: 'fixture:2026-10:1',
        nextCursor: 'fixture:2026-10:2',
        checkpointedAt: '2026-10-10T00:00:02.000Z',
        observations: [],
        exhausted: true,
        completedAt: '2026-10-10T00:00:02.000Z',
        manifestHash: `sha256:${'2'.repeat(64)}`,
        completedEventId: '0199c8f2-2394-7ba0-8f9e-286378779223',
      }),
    ).resolves.toMatchObject({ committed: true, run: { status: 'completed' } });

    await expect(repository.findByOperationKey(runInput.operationKey)).resolves.toEqual({
      operationKey: runInput.operationKey,
      sourceId: runInput.sourceId,
      runId: runInput.runId,
      snapshotId: firstObservation.snapshotId,
      parsedEventId: firstObservation.parsedEventId,
      completedEventId: '0199c8f2-2394-7ba0-8f9e-286378779223',
      contentHash: firstObservation.contentHash,
      objectKey: firstObservation.objectKey,
      replayed: false,
    });
  });

  it('uses a failed observation from the latest completed run as the change baseline', async () => {
    const repository = new InMemoryCollectionRunRepository();
    const transaction = {} as Transaction;
    const sourceId = 'synthetic-portal-aurora';
    const sourceListingId = 'AUR-BV-001';
    const complete = async (
      runId: Parameters<InMemoryCollectionRunRepository['startOrLoad']>[1]['runId'],
      operationKey: string,
      contentHash: Sha256Hash,
      outcome: 'parsed' | 'failed',
    ): Promise<void> => {
      await repository.startOrLoad(transaction, {
        operationKey,
        runId,
        sourceId,
        startedAt: '2026-10-10T00:00:00.000Z',
      });
      await repository.commitPage(transaction, {
        runId,
        expectedOrdinal: 0,
        expectedCursor: null,
        nextCursor: null,
        checkpointedAt: '2026-10-10T00:00:01.000Z',
        observations: [
          {
            snapshotId:
              outcome === 'parsed'
                ? '0199c8f2-2394-7ba0-8f9e-286378779231'
                : '0199c8f2-2394-7ba0-8f9e-286378779241',
            parsedEventId: outcome === 'parsed' ? '0199c8f2-2394-7ba0-8f9e-286378779232' : null,
            sourceListingId,
            sourceUrl: 'https://aurora.synthetic.invalid/listings/AUR-BV-001',
            observedAt: '2026-10-10T00:00:00.000Z',
            contentHash,
            objectKey: `synthetic/${contentHash}.json`,
            byteLength: 10,
            mediaType: 'application/json',
            outcome,
            changed: false,
            failureReason: outcome === 'failed' ? 'parse-rejected' : null,
          },
        ],
        exhausted: true,
        completedAt: '2026-10-10T00:00:01.000Z',
        manifestHash: `sha256:${'f'.repeat(64)}`,
        completedEventId:
          outcome === 'parsed'
            ? '0199c8f2-2394-7ba0-8f9e-286378779233'
            : '0199c8f2-2394-7ba0-8f9e-286378779243',
      });
    };

    await complete(
      '0199c8f2-2394-7ba0-8f9e-286378779230',
      'earlier-parsed',
      `sha256:${'1'.repeat(64)}`,
      'parsed',
    );
    await complete(
      '0199c8f2-2394-7ba0-8f9e-286378779240',
      'latest-failed',
      `sha256:${'2'.repeat(64)}`,
      'failed',
    );

    await expect(
      repository.findLatestCompletedContentHash(
        transaction,
        sourceId,
        '0199c8f2-2394-7ba0-8f9e-286378779250',
        sourceListingId,
      ),
    ).resolves.toBe(`sha256:${'2'.repeat(64)}`);
  });
});

describe('S3RawSnapshotStore', () => {
  const config = {
    endpoint: 'http://minio.test:9000',
    region: 'us-east-1',
    bucket: 'snapshots',
    accessKeyId: 'access',
    secretAccessKey: 'secret',
  };
  const input = {
    sourceId: 'synthetic-data',
    mediaType: 'application/json',
    synthetic: true,
    bytes: new TextEncoder().encode('{"fixture":true}'),
  } as const;

  it('creates the bucket once and writes an immutable hash-keyed object', async () => {
    const commands: unknown[] = [];
    const send = vi.spyOn(S3Client.prototype, 'send').mockImplementation((command) => {
      commands.push(command);
      if (command instanceof HeadBucketCommand) {
        return Promise.reject({ $metadata: { httpStatusCode: 404 } }) as never;
      }
      if (command instanceof HeadObjectCommand) {
        return Promise.reject({ $metadata: { httpStatusCode: 404 } }) as never;
      }
      return Promise.resolve({}) as never;
    });
    const destroy = vi.spyOn(S3Client.prototype, 'destroy').mockImplementation(() => undefined);
    const store = new S3RawSnapshotStore(config);

    const result = await store.store(input, new AbortController().signal);
    const digest = createHash('sha256').update(input.bytes).digest('hex');
    expect(result).toEqual({
      contentHash: `sha256:${digest}`,
      objectKey: `synthetic/sha256/${digest}.json`,
      byteLength: input.bytes.byteLength,
      mediaType: 'application/json',
    });
    expect(commands[0]).toBeInstanceOf(HeadBucketCommand);
    expect(commands[1]).toBeInstanceOf(CreateBucketCommand);
    expect(commands[2]).toBeInstanceOf(HeadObjectCommand);
    expect(commands[3]).toBeInstanceOf(PutObjectCommand);
    store.destroy();
    expect(destroy).toHaveBeenCalledOnce();
    send.mockRestore();
    destroy.mockRestore();
  });

  it('verifies an existing immutable object after a conditional-write conflict', async () => {
    const digest = createHash('sha256').update(input.bytes).digest('hex');
    let headObjectCalls = 0;
    const send = vi.spyOn(S3Client.prototype, 'send').mockImplementation((command) => {
      if (command instanceof PutObjectCommand) {
        return Promise.reject({
          name: 'PreconditionFailed',
          $metadata: { httpStatusCode: 412 },
        }) as never;
      }
      if (command instanceof HeadObjectCommand) {
        headObjectCalls += 1;
        if (headObjectCalls === 1) {
          return Promise.reject({ $metadata: { httpStatusCode: 404 } }) as never;
        }
        return Promise.resolve({
          ContentLength: input.bytes.byteLength,
          Metadata: { 'rei-content-hash': `sha256:${digest}` },
        }) as never;
      }
      if (command instanceof GetObjectCommand) {
        return Promise.resolve({
          Body: { transformToByteArray: async () => input.bytes },
        }) as never;
      }
      return Promise.resolve({}) as never;
    });
    const store = new S3RawSnapshotStore(config);

    await expect(store.store(input, new AbortController().signal)).resolves.toMatchObject({
      contentHash: `sha256:${digest}`,
    });
    expect(send.mock.calls.some(([command]) => command instanceof HeadObjectCommand)).toBe(true);
    expect(send.mock.calls.some(([command]) => command instanceof GetObjectCommand)).toBe(true);
    send.mockRestore();
  });

  it('accepts S3-compatible existing-bucket errors without relying on an SDK subclass', async () => {
    const send = vi.spyOn(S3Client.prototype, 'send').mockImplementation((command) => {
      if (command instanceof HeadBucketCommand) {
        return Promise.reject({ $metadata: { httpStatusCode: 404 } }) as never;
      }
      if (command instanceof CreateBucketCommand) {
        return Promise.reject({ name: 'BucketAlreadyOwnedByYou' }) as never;
      }
      if (command instanceof HeadObjectCommand) {
        return Promise.reject({ $metadata: { httpStatusCode: 404 } }) as never;
      }
      return Promise.resolve({}) as never;
    });
    const store = new S3RawSnapshotStore(config);

    await expect(store.store(input, new AbortController().signal)).resolves.toMatchObject({
      objectKey: expect.stringContaining('synthetic/sha256/'),
    });
    expect(send.mock.calls.some(([command]) => command instanceof PutObjectCommand)).toBe(true);
    send.mockRestore();
  });

  it('reuses an existing verified content-addressed object without rewriting it', async () => {
    const digest = createHash('sha256').update(input.bytes).digest('hex');
    const send = vi.spyOn(S3Client.prototype, 'send').mockImplementation((command) => {
      if (command instanceof HeadObjectCommand) {
        return Promise.resolve({
          ContentLength: input.bytes.byteLength,
          Metadata: { 'rei-content-hash': `sha256:${digest}` },
        }) as never;
      }
      if (command instanceof GetObjectCommand) {
        return Promise.resolve({
          Body: { transformToByteArray: async () => input.bytes },
        }) as never;
      }
      return Promise.resolve({}) as never;
    });
    const store = new S3RawSnapshotStore(config);

    await expect(store.store(input, new AbortController().signal)).resolves.toMatchObject({
      contentHash: `sha256:${digest}`,
    });
    expect(send.mock.calls.some(([command]) => command instanceof PutObjectCommand)).toBe(false);
    expect(send.mock.calls.some(([command]) => command instanceof GetObjectCommand)).toBe(true);
    send.mockRestore();
  });

  it('rejects a same-length existing object whose body does not match its claimed hash', async () => {
    const digest = createHash('sha256').update(input.bytes).digest('hex');
    const corruptedBytes = new Uint8Array(input.bytes.byteLength).fill(32);
    const send = vi.spyOn(S3Client.prototype, 'send').mockImplementation((command) => {
      if (command instanceof HeadObjectCommand) {
        return Promise.resolve({
          ContentLength: input.bytes.byteLength,
          Metadata: { 'rei-content-hash': `sha256:${digest}` },
        }) as never;
      }
      if (command instanceof GetObjectCommand) {
        return Promise.resolve({
          Body: { transformToByteArray: async () => corruptedBytes },
        }) as never;
      }
      return Promise.resolve({}) as never;
    });
    const store = new S3RawSnapshotStore(config);

    await expect(store.store(input, new AbortController().signal)).rejects.toMatchObject({
      kind: 'rejected',
      operation: 'raw-snapshot.store',
    });
    expect(corruptedBytes.byteLength).toBe(input.bytes.byteLength);
    expect(send.mock.calls.some(([command]) => command instanceof PutObjectCommand)).toBe(false);
    send.mockRestore();
  });

  it('reads immutable bytes without exposing provider response types', async () => {
    const send = vi.spyOn(S3Client.prototype, 'send').mockImplementation((command) => {
      if (command instanceof GetObjectCommand) {
        return Promise.resolve({
          Body: { transformToByteArray: async () => input.bytes },
        }) as never;
      }
      return Promise.resolve({}) as never;
    });
    const store = new S3RawSnapshotStore(config);

    await expect(
      store.read('synthetic/sha256/example.json', new AbortController().signal),
    ).resolves.toEqual(input.bytes);
    send.mockRestore();
  });

  it('maps credentials, transient failures, and cancellation to the closed vocabulary', async () => {
    const send = vi.spyOn(S3Client.prototype, 'send');
    send.mockRejectedValueOnce({ $metadata: { httpStatusCode: 403 } } as never);
    await expect(
      new S3RawSnapshotStore(config).store(input, new AbortController().signal),
    ).rejects.toMatchObject({ kind: 'unauthorized' });

    send.mockRejectedValueOnce(new Error('network down') as never);
    await expect(
      new S3RawSnapshotStore(config).store(input, new AbortController().signal),
    ).rejects.toMatchObject({ kind: 'transient' });

    const controller = new AbortController();
    controller.abort();
    await expect(new S3RawSnapshotStore(config).store(input, controller.signal)).rejects.toEqual(
      expect.any(ExternalFailure),
    );
    send.mockRestore();
  });
});
