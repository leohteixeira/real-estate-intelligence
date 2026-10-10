import type {
  CollectionExecutionResult,
  CollectionRunRepository,
  CollectionSourceRegistration,
  ListingSource,
  PersistCompletedCollectionInput,
  PersistCompletedCollectionResult,
  RawListingDocument,
  RawSnapshotStore,
  StoredRawSnapshot,
  StoreRawSnapshotInput,
  Transaction,
} from '@rei/application';
import type { CollectedListing } from '@rei/domain';
import { createHash } from 'node:crypto';

export class InMemoryListingSource implements ListingSource {
  public constructor(
    private readonly document: RawListingDocument,
    private readonly listing: CollectedListing,
  ) {}

  public async fetch(sourceId: string, signal: AbortSignal): Promise<RawListingDocument> {
    signal.throwIfAborted();
    if (sourceId !== this.document.sourceId) throw new Error('The in-memory source is unknown.');
    return Object.freeze({ ...this.document, bytes: Uint8Array.from(this.document.bytes) });
  }

  public async parse(
    _document: RawListingDocument,
    signal: AbortSignal,
  ): Promise<CollectedListing> {
    signal.throwIfAborted();
    return structuredClone(this.listing);
  }
}

export class InMemoryRawSnapshotStore implements RawSnapshotStore {
  readonly #objects = new Map<string, Uint8Array>();

  public async store(
    input: StoreRawSnapshotInput,
    signal: AbortSignal,
  ): Promise<StoredRawSnapshot> {
    signal.throwIfAborted();
    const digest = createHash('sha256').update(input.bytes).digest('hex');
    const contentHash = `sha256:${digest}` as StoredRawSnapshot['contentHash'];
    const objectKey = `synthetic/sha256/${digest}.json`;
    this.#objects.set(objectKey, Uint8Array.from(input.bytes));
    return Object.freeze({
      contentHash,
      objectKey,
      byteLength: input.bytes.byteLength,
      mediaType: input.mediaType,
    });
  }

  public read(objectKey: string): Uint8Array | undefined {
    const bytes = this.#objects.get(objectKey);
    return bytes ? Uint8Array.from(bytes) : undefined;
  }

  public get size(): number {
    return this.#objects.size;
  }
}

export class InMemoryCollectionRunRepository implements CollectionRunRepository {
  readonly #registrations = new Map<string, CollectionSourceRegistration>();
  readonly #results = new Map<string, CollectionExecutionResult>();

  public constructor(registrations: readonly CollectionSourceRegistration[]) {
    for (const registration of registrations) {
      this.#registrations.set(registration.sourceId, Object.freeze({ ...registration }));
    }
  }

  public async findByOperationKey(operationKey: string): Promise<CollectionExecutionResult | null> {
    return this.#results.get(operationKey) ?? null;
  }

  public async findSource(sourceId: string): Promise<CollectionSourceRegistration | null> {
    return this.#registrations.get(sourceId) ?? null;
  }

  public async persistCompleted(
    _transaction: Transaction,
    input: PersistCompletedCollectionInput,
  ): Promise<PersistCompletedCollectionResult> {
    const existing = this.#results.get(input.operationKey);
    if (existing) return { created: false, result: existing };
    const result = Object.freeze({
      operationKey: input.operationKey,
      runId: input.runId,
      snapshotId: input.snapshotId,
      parsedEventId: input.parsedEventId,
      completedEventId: input.completedEventId,
      contentHash: input.contentHash,
      objectKey: input.objectKey,
      replayed: false,
    });
    this.#results.set(input.operationKey, result);
    return { created: true, result };
  }
}
