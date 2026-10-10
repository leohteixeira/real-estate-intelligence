import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { RawListingDocument, Transaction } from '@rei/application';
import { ExternalFailure } from '@rei/application';
import {
  StaleCollectionCheckpointError,
  createSourceRegistration,
  type CollectedListing,
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
      counts: { observed: 1, parsed: 1, suppressed: 0, failed: 0 },
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
