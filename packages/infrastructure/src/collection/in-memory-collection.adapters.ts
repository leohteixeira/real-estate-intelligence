import type {
  CollectionExecutionResult,
  CollectionRunRepository,
  CommitCollectionPageInput,
  ListingSource,
  PersistCompletedCollectionInput,
  PersistCompletedCollectionResult,
  PersistedCollectionObservation,
  RawListingDocument,
  RawSnapshotStore,
  SourceRegisterRepository,
  StoredRawSnapshot,
  StoreRawSnapshotInput,
  Transaction,
} from '@rei/application';
import { ExternalFailure, ListingSourceAccessRefusal } from '@rei/application';
import {
  createSourceRegistration,
  createRunningCollectionRun,
  decideSourceEnablement,
  advanceCollectionRun,
  pauseCollectionRun,
  resumeCollectionRun,
  StaleCollectionCheckpointError,
  toEnabledSourceView,
  type CollectedListing,
  type CollectionRunState,
  type EnabledSourceView,
  type SourceRegistration,
  type SourceHold,
} from '@rei/domain';
import { createHash } from 'node:crypto';

export class InMemoryListingSource implements ListingSource {
  public constructor(
    private readonly document: RawListingDocument,
    private readonly listing: CollectedListing,
  ) {}

  public async fetchPage(sourceId: string, cursor: string | null, signal: AbortSignal) {
    signal.throwIfAborted();
    if (sourceId !== this.document.sourceId) throw new Error('The in-memory source is unknown.');
    if (cursor !== null)
      return Object.freeze({ documents: Object.freeze([]), nextCursor: null, exhausted: true });
    return Object.freeze({
      documents: Object.freeze([
        Object.freeze({ ...this.document, bytes: Uint8Array.from(this.document.bytes) }),
      ]),
      nextCursor: null,
      exhausted: true,
    });
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
    if (!input.synthetic)
      throw new ExternalFailure({ kind: 'forbidden', operation: 'raw-snapshot.store' });
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
  public readonly parsedEvidence: import('@rei/application').ParsedCollectionEvent[] = [];
  public async appendParsedEvidence(
    _transaction: Transaction,
    events: readonly import('@rei/application').ParsedCollectionEvent[],
  ): Promise<void> {
    this.parsedEvidence.push(...events);
  }
  readonly #runs = new Map<string, CollectionRunState>();
  readonly #operationRuns = new Map<string, string>();
  readonly #observations = new Map<string, PersistedCollectionObservation[]>();

  public async pause(
    _transaction: Transaction,
    runId: CollectionRunState['runId'],
    hold: SourceHold,
  ) {
    const run = this.#runs.get(runId);
    if (!run) throw new Error('Collection run was not found.');
    const paused = run.status === 'completed' ? run : pauseCollectionRun(run, hold);
    this.#runs.set(runId, paused);
    return paused;
  }

  public async resume(_transaction: Transaction, runId: CollectionRunState['runId']) {
    const run = this.#runs.get(runId);
    if (!run) throw new Error('Collection run was not found.');
    const resumed = resumeCollectionRun(run);
    this.#runs.set(runId, resumed);
    return resumed;
  }

  public async findByOperationKey(operationKey: string): Promise<CollectionExecutionResult | null> {
    const run = await this.loadRunByOperationKey(operationKey);
    if (!run || run.status !== 'completed' || run.completedEventId === null) return null;
    const observations = this.#observations.get(run.runId) ?? [];
    const observation = observations.length === 1 ? observations[0] : undefined;
    if (!observation || observation.parsedEventId === null) return null;
    return Object.freeze({
      operationKey: run.operationKey,
      sourceId: run.sourceId,
      runId: run.runId,
      snapshotId: observation.snapshotId,
      parsedEventId: observation.parsedEventId,
      completedEventId: run.completedEventId,
      contentHash: observation.contentHash,
      objectKey: observation.objectKey,
      replayed: false,
    });
  }

  public async persistCompleted(
    _transaction: Transaction,
    input: PersistCompletedCollectionInput,
  ): Promise<PersistCompletedCollectionResult> {
    const existingRunId = this.#operationRuns.get(input.operationKey);
    if (existingRunId) {
      const existingRun = this.#runs.get(existingRunId);
      if (!existingRun || existingRun.sourceId !== input.sourceId) {
        throw new Error('Collection operation key is already bound to a different source.');
      }
      const existing = await this.findByOperationKey(input.operationKey);
      if (!existing) {
        throw new Error('Existing collection operation is not a one-shot completed result.');
      }
      return { created: false, result: existing };
    }
    const run = advanceCollectionRun(
      createRunningCollectionRun({
        operationKey: input.operationKey,
        runId: input.runId,
        sourceId: input.sourceId,
        startedAt: input.startedAt,
      }),
      {
        expectedOrdinal: 0,
        expectedCursor: null,
        nextCursor: null,
        checkpointedAt: input.completedAt,
        observedDelta: 1,
        exhausted: true,
        completedAt: input.completedAt,
        manifestHash: input.manifestHash,
        completedEventId: input.completedEventId,
      },
    );
    const observation = Object.freeze({
      snapshotId: input.snapshotId,
      parsedEventId: input.parsedEventId,
      sourceListingId: input.sourceListingId,
      sourceUrl: input.sourceUrl,
      observedAt: input.observedAt,
      contentHash: input.contentHash,
      objectKey: input.objectKey,
      outcome: 'parsed' as const,
      changed: false,
      failureReason: null,
      imageFingerprints:
        input.imageFingerprints == null ? null : Object.freeze([...input.imageFingerprints]),
    });
    this.#operationRuns.set(input.operationKey, run.runId);
    this.#runs.set(run.runId, run);
    this.#observations.set(run.runId, [observation]);
    const result = Object.freeze({
      operationKey: input.operationKey,
      sourceId: input.sourceId,
      runId: input.runId,
      snapshotId: input.snapshotId,
      parsedEventId: input.parsedEventId,
      completedEventId: input.completedEventId,
      contentHash: input.contentHash,
      objectKey: input.objectKey,
      replayed: false,
    });
    return { created: true, result };
  }

  public async loadRunByOperationKey(operationKey: string): Promise<CollectionRunState | null> {
    const runId = this.#operationRuns.get(operationKey);
    return runId ? (this.#runs.get(runId) ?? null) : null;
  }

  public async startOrLoad(
    _transaction: Transaction,
    input: {
      operationKey: string;
      runId: CollectionRunState['runId'];
      sourceId: string;
      startedAt: string;
    },
  ): Promise<CollectionRunState> {
    const existing = await this.loadRunByOperationKey(input.operationKey);
    if (existing) return existing;
    const run = createRunningCollectionRun(input);
    this.#operationRuns.set(input.operationKey, run.runId);
    this.#runs.set(run.runId, run);
    this.#observations.set(run.runId, []);
    return run;
  }

  public async lockRunForPage(
    _transaction: Transaction,
    runId: CollectionRunState['runId'],
    expectedOrdinal: number,
    expectedCursor: string | null,
  ): Promise<CollectionRunState> {
    const run = this.#runs.get(runId);
    if (!run) throw new Error('Collection run was not found.');
    if (
      run.status !== 'running' ||
      run.checkpoint.ordinal !== expectedOrdinal ||
      run.checkpoint.cursor !== expectedCursor
    ) {
      throw new StaleCollectionCheckpointError();
    }
    return run;
  }

  public async listObservations(
    _transaction: Transaction,
    runId: CollectionRunState['runId'],
  ): Promise<readonly PersistedCollectionObservation[]> {
    return Object.freeze([...(this.#observations.get(runId) ?? [])]);
  }

  public async findLatestCompletedContentHash(
    _transaction: Transaction,
    sourceId: string,
    beforeRunId: CollectionRunState['runId'],
    sourceListingId: string,
  ) {
    const candidates = [...this.#runs.values()]
      .filter(
        (run) => run.sourceId === sourceId && run.status === 'completed' && run.runId < beforeRunId,
      )
      .sort((left, right) => right.runId.localeCompare(left.runId));
    for (const candidate of candidates) {
      const observation = (this.#observations.get(candidate.runId) ?? []).find(
        (item) => item.sourceListingId === sourceListingId,
      );
      if (observation) return observation.contentHash;
    }
    return null;
  }

  public async commitPage(_transaction: Transaction, input: CommitCollectionPageInput) {
    const run = this.#runs.get(input.runId);
    if (!run) throw new Error('Collection run was not found.');
    if (
      run.status !== 'running' ||
      run.checkpoint.ordinal !== input.expectedOrdinal ||
      run.checkpoint.cursor !== input.expectedCursor
    ) {
      return { committed: false, run } as const;
    }
    const existing = this.#observations.get(input.runId) ?? [];
    const identities = new Set(existing.map(({ sourceListingId }) => sourceListingId));
    for (const observation of input.observations) {
      if (identities.has(observation.sourceListingId)) {
        throw new Error('Collection observation identity conflicts with the committed prefix.');
      }
      identities.add(observation.sourceListingId);
    }
    const next = advanceCollectionRun(run, {
      expectedOrdinal: input.expectedOrdinal,
      expectedCursor: input.expectedCursor,
      nextCursor: input.nextCursor,
      checkpointedAt: input.checkpointedAt,
      observedDelta: input.observations.length,
      parsedDelta: input.observations.filter(({ outcome }) => outcome === 'parsed').length,
      changedDelta: input.observations.filter(({ changed }) => changed).length,
      failedDelta: input.observations.filter(({ outcome }) => outcome === 'failed').length,
      exhausted: input.exhausted,
      ...(input.completedAt === null ? {} : { completedAt: input.completedAt }),
      ...(input.manifestHash === null ? {} : { manifestHash: input.manifestHash }),
      ...(input.completedEventId === null ? {} : { completedEventId: input.completedEventId }),
    });
    this.#observations.set(input.runId, [
      ...existing,
      ...input.observations.map((item) =>
        Object.freeze({
          snapshotId: item.snapshotId,
          parsedEventId: item.parsedEventId,
          sourceListingId: item.sourceListingId,
          sourceUrl: item.sourceUrl,
          observedAt: item.observedAt,
          contentHash: item.contentHash,
          objectKey: item.objectKey,
          outcome: item.outcome,
          changed: item.changed,
          failureReason: item.failureReason,
        }),
      ),
    ]);
    this.#runs.set(input.runId, next);
    return { committed: true, run: next } as const;
  }
}

export class InMemorySourceRegisterRepository implements SourceRegisterRepository {
  readonly #sources = new Map<string, SourceRegistration>();

  public constructor(sources: readonly SourceRegistration[]) {
    for (const source of sources) this.#sources.set(source.sourceId, source);
  }

  public async holdAtomically(sourceId: string, hold: SourceHold, signal?: AbortSignal) {
    signal?.throwIfAborted();
    const current = this.#sources.get(sourceId);
    if (!current) return null;
    const held = createSourceRegistration({
      ...current,
      enabled: false,
      enabledAt: null,
      hold: current.hold ?? hold,
    });
    this.#sources.set(sourceId, held);
    return held;
  }

  public async clearHoldAfterReview(sourceId: string, reviewedAt: string, signal?: AbortSignal) {
    signal?.throwIfAborted();
    const current = this.#sources.get(sourceId);
    if (!current) return null;
    if (!Number.isFinite(Date.parse(reviewedAt)))
      throw new TypeError('Review instant is required.');
    if (current.hold && Date.parse(reviewedAt) < Date.parse(current.hold.heldAt))
      throw new TypeError('Review must follow the source hold.');
    const reviewed = createSourceRegistration({ ...current, hold: null });
    this.#sources.set(sourceId, reviewed);
    return reviewed;
  }

  public async assertCollectible(_transaction: Transaction, sourceId: string) {
    const current = this.#sources.get(sourceId);
    if (current?.hold) throw new ListingSourceAccessRefusal(current.hold.reason);
    if (!current?.enabled || !current.permissions.collectionAllowed)
      throw new Error('Source is not collectible.');
  }

  public async findById(
    sourceId: string,
    signal?: AbortSignal,
  ): Promise<SourceRegistration | null> {
    signal?.throwIfAborted();
    return this.#sources.get(sourceId) ?? null;
  }

  public async enableAtomically(
    sourceId: string,
    enabledAt: string,
    signal?: AbortSignal,
  ): Promise<SourceRegistration | null> {
    signal?.throwIfAborted();
    const current = this.#sources.get(sourceId);
    if (!current) return null;
    if (!decideSourceEnablement(current).eligible) return null;
    const enabled = current.enabled
      ? current
      : createSourceRegistration({ ...current, enabled: true, enabledAt });
    this.#sources.set(sourceId, enabled);
    return enabled;
  }

  public async listEnabled(signal?: AbortSignal): Promise<readonly EnabledSourceView[]> {
    signal?.throwIfAborted();
    return Object.freeze(
      [...this.#sources.values()]
        .filter((source) => source.enabled)
        .sort((left, right) => left.sourceId.localeCompare(right.sourceId))
        .map(toEnabledSourceView),
    );
  }
}
