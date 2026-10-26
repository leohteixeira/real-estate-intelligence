import {
  CollectionRunCompleted,
  CollectionSnapshotParsed,
  CollectionSnapshotCorrected,
  ListingChronology,
  Property,
  DomainValidationError,
  NormalizedListing,
  parseCollectionEvent,
  parsePropertiesEvent,
  isSerializableEventPayload,
  type PropertiesEvent,
} from '@rei/domain';
import type { CollectionHistoryFacade, CanonicalCompletedRun } from '../collection/index.js';
import type { LocationsFacade } from '../locations/index.js';
import {
  ExternalFailure,
  type Transaction,
  type TransactionRunner,
  type Inbox,
  type OutboxAppendPort,
  type UuidV7Generator,
  type RetainedPublicationReader,
} from '../shared/index.js';
import type { PropertyRepository } from './property.repository.js';
import type { ListingHistoryRepository } from './listing-history.repository.js';

export const LISTING_COMPLETION_CONSUMER = 'properties.completed-run';
export class ConsumeListingCompletion {
  public constructor(
    private readonly collection: Pick<CollectionHistoryFacade, 'verifyCompletedEvent'>,
    private readonly repository: Pick<ListingHistoryRepository, 'enqueue'>,
    private readonly transactions: TransactionRunner,
    private readonly inbox: Inbox,
  ) {}
  public async execute(untrusted: unknown, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    const event = parseCollectionEvent(untrusted);
    if (!(event instanceof CollectionRunCompleted))
      throw new ExternalFailure({ kind: 'rejected', operation: 'properties.completed-run' });
    await this.transactions.runInTransaction(async (transaction) => {
      if (!(await this.collection.verifyCompletedEvent(transaction, event)))
        throw new ExternalFailure({ kind: 'rejected', operation: 'properties.completed-run' });
      if (await this.inbox.record(transaction, LISTING_COMPLETION_CONSUMER, event.eventId))
        await this.repository.enqueue(transaction, event.payload.sourceId);
    }, signal);
  }
}

/** Durable source progress is committed separately from each atomic listing effect. */
export class ReconcileListingHistory {
  public constructor(
    private readonly collection: CollectionHistoryFacade,
    private readonly locations: Pick<LocationsFacade, 'resolveFixtureAddress'>,
    private readonly properties: PropertyRepository,
    private readonly history: ListingHistoryRepository,
    private readonly transactions: TransactionRunner,
    private readonly outbox: OutboxAppendPort,
    private readonly identifiers: UuidV7Generator,
    private readonly hash: (text: string) => string,
    private readonly publications: RetainedPublicationReader,
  ) {}
  public async execute(limit: number, signal: AbortSignal): Promise<number> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      throw new RangeError('History batch must contain 1-100 listing effects.');
    let applied = 0;
    const sources = await this.history.nextSources(limit, signal);
    for (const work of sources) {
      signal.throwIfAborted();
      const legacyLimit = Math.min(limit - applied, Math.max(1, Math.floor(limit / 3)));
      const legacyIdentities = await this.history.pendingOriginalIdentities(
        work.sourceId,
        legacyLimit,
        signal,
      );
      let recovered = 0;
      for (const identity of legacyIdentities) {
        if (recovered >= legacyLimit) break;
        recovered += await this.recoverOriginals(
          work.sourceId,
          identity,
          legacyLimit - recovered,
          signal,
        );
      }
      applied += recovered;
      const next = await this.transactions.runInTransaction(async (transaction) => {
        // Finish the bounded legacy backlog before advancing complete-run chronology.
        if (recovered > 0 || applied >= limit) return null;
        const run = await this.collection.nextCompletedRun(transaction, work.sourceId, work.after);
        if (!run) return null;
        const identities = await this.history.listingIdentities(
          transaction,
          work.sourceId,
          run.observedSourceListingIds,
          work.listingCursor,
          limit - applied,
        );
        return { run, identities };
      }, signal);
      if (next) {
        for (const identity of next.identities) {
          try {
            await this.reconcile(next.run, identity, signal);
          } catch (error) {
            // A permanently invalid original cannot poison every later listing and source run.
            // Its failed business transaction leaves no facts, entity, history or outbox writes.
            if (
              !(error instanceof DomainValidationError) &&
              !(
                error instanceof ExternalFailure &&
                error.kind === 'rejected' &&
                error.operation === 'properties.resolve-listing-history'
              )
            )
              throw error;
            await this.transactions.runInTransaction(async (transaction) => {
              if (!(await this.collection.verifyCompletedEvent(transaction, next.run.event)))
                throw new ExternalFailure({
                  kind: 'rejected',
                  operation: 'properties.listing-history',
                });
              await this.properties.lockSourceIdentity(transaction, next.run.sourceId, identity);
              await this.history.markRun(
                transaction,
                next.run.sourceId,
                identity,
                next.run.runId,
                'rejected',
              );
            }, signal);
          }
          applied++;
        }
        await this.history.progress(
          work,
          next.identities.at(-1) ?? null,
          next.identities.length === 0
            ? { startedAt: next.run.startedAt, runId: next.run.runId }
            : null,
          signal,
        );
      } else await this.history.progress(work, work.listingCursor, null, signal);
      // Fairness cursors are progress, never part of an atomic listing business effect.
      const lastOriginalIdentity = legacyIdentities.at(-1);
      if (lastOriginalIdentity)
        await this.transactions.runInTransaction(
          (transaction) =>
            this.history.rotateOriginalIdentity(transaction, work.sourceId, lastOriginalIdentity),
          signal,
        );
      // Corrections arriving after their run was applied remain durable receipt work.
      const corrections = await this.history.pendingCorrections(work.sourceId, limit, signal);
      for (const correction of corrections) {
        if (applied >= limit) break;
        await this.transactions.runInTransaction(async (transaction) => {
          if (!(await this.collection.verifyParsedEvent(transaction, correction))) return;
          await this.properties.lockSourceIdentity(
            transaction,
            work.sourceId,
            correction.payload.source.sourceListingId,
          );
          const loaded = await this.history.load(
            transaction,
            work.sourceId,
            correction.payload.source.sourceListingId,
          );
          if (!loaded) return;
          if (loaded.state === null) await this.retainCreation(transaction, loaded.property);
          const chronology = new ListingChronology(loaded.property, loaded.state, this.hash);
          if (
            !chronology.state.acquisitions.some(
              (item) =>
                item.original.eventId === correction.payload.correction.originalParsedEventId,
            )
          )
            return;
          await this.correct(transaction, chronology, correction.payload.snapshot.snapshotId);
          await this.history.save(transaction, loaded.property, chronology.state, []);
          if (!(await this.history.correctionDisposition(transaction, correction.eventId)))
            await this.history.markCorrection(transaction, correction.eventId);
        }, signal);
        applied++;
      }
      if (applied >= limit) break;
    }
    return applied;
  }
  private businessRefusal(error: unknown): boolean {
    return (
      error instanceof DomainValidationError ||
      (error instanceof ExternalFailure &&
        error.kind === 'rejected' &&
        error.operation === 'properties.resolve-listing-history')
    );
  }
  /** A Properties-invalid interpretation refuses only that correction, preserving the original. */
  private async correct(
    transaction: Transaction,
    chronology: ListingChronology,
    snapshotId: string,
  ): Promise<void> {
    for (const candidate of await this.collection.getSnapshotCorrections(transaction, snapshotId)) {
      if (!(candidate instanceof CollectionSnapshotCorrected)) continue;
      if ((await this.history.correctionDisposition(transaction, candidate.eventId)) === 'rejected')
        continue;
      if (!(await this.properties.hasFact(transaction, candidate.eventId)))
        await this.properties.appendFact(transaction, candidate, 'pending-correction');
      try {
        const resolved = await this.resolve(transaction, candidate);
        chronology.correct(candidate, resolved);
      } catch (error) {
        if (!this.businessRefusal(error)) throw error;
        await this.history.markCorrection(transaction, candidate.eventId, 'rejected');
        continue;
      }
      await this.history.markCorrection(transaction, candidate.eventId);
      break;
    }
  }
  private async publish(
    transaction: Transaction,
    events: readonly PropertiesEvent[],
  ): Promise<void> {
    await this.outbox.append(
      transaction,
      events.map((event) => {
        const payload: unknown = JSON.parse(JSON.stringify(event.payload));
        if (!isSerializableEventPayload(payload))
          throw new TypeError('Invalid listing event payload.');
        return { ...event, payload };
      }),
    );
  }
  private async recoverOriginals(
    sourceId: string,
    identity: string,
    limit: number,
    signal: AbortSignal,
  ): Promise<number> {
    return this.transactions.runInTransaction(async (transaction) => {
      const initial = await this.history.load(transaction, sourceId, identity);
      if (!initial) return 0; // Only authenticated initial identities can upgrade without completion.
      if (!(await this.collection.verifyParsedEvent(transaction, initial.property.initial)))
        return 0;
      // Collection authority locks precede Properties identity/global locks, as in ingestion.
      // Reload under the identity lock: another history transaction may have advanced chronology.
      await this.properties.lockSourceIdentity(transaction, sourceId, identity);
      const loaded = await this.history.load(transaction, sourceId, identity);
      if (!loaded) return 0;
      if (loaded.state === null) await this.retainCreation(transaction, loaded.property);
      const chronology = new ListingChronology(loaded.property, loaded.state, this.hash);
      const excluded = [
        ...chronology.state.acquisitions.map((item) => item.original.eventId),
        ...(await this.history.originalEffects(transaction, sourceId, identity)),
      ];
      const originals = await this.collection.getLegacyListingFacts(
        transaction,
        sourceId,
        identity,
        excluded,
        limit,
      );
      const events: PropertiesEvent[] = [];
      for (const original of originals) {
        if (!(original instanceof CollectionSnapshotParsed)) continue;
        try {
          const resolved = await this.resolve(transaction, original);
          const ids = [];
          for (let n = 0; n < 3; n++) ids.push(await this.identifiers.generate(transaction));
          events.push(...this.observe(chronology, loaded.property, original, resolved, ids, true));
        } catch (error) {
          if (!this.businessRefusal(error)) throw error;
          if (!(await this.properties.hasFact(transaction, original.eventId)))
            await this.properties.appendFact(transaction, original, 'pending-history');
          await this.history.markOriginal(transaction, original.eventId);
          continue;
        }
        if (!(await this.properties.hasFact(transaction, original.eventId)))
          await this.properties.appendFact(transaction, original, 'pending-history');
        await this.correct(transaction, chronology, original.payload.snapshot.snapshotId);
        await this.history.markOriginal(transaction, original.eventId);
      }
      if (originals.length > 0 || loaded.state === null) {
        await this.history.save(transaction, loaded.property, chronology.state, events);
        await this.publish(transaction, events);
      }
      signal.throwIfAborted();
      return originals.length;
    }, signal);
  }
  private async resolve(
    transaction: Transaction,
    event: CollectionSnapshotParsed | CollectionSnapshotCorrected,
  ) {
    new NormalizedListing(event);
    const resolved = await this.locations.resolveFixtureAddress(
      event.payload.listing.location,
      transaction,
    );
    if (!resolved)
      throw new ExternalFailure({
        kind: 'rejected',
        operation: 'properties.resolve-listing-history',
      });
    return resolved;
  }
  private async retainCreation(transaction: Transaction, property: Property): Promise<void> {
    const retained = await this.publications.find(
      transaction,
      property.listingId,
      'properties.listing.created',
    );
    if (!retained) return; // Expired legacy publications are never fabricated or re-emitted.
    const event = parsePropertiesEvent({ ...retained });
    const listing = (event as PropertiesEvent<'properties.listing.created'>).payload.listing;
    if (
      event.type !== 'properties.listing.created' ||
      event.payload.revision !== 1 ||
      listing.listingId !== property.listingId ||
      listing.propertyId !== property.propertyId ||
      listing.provenance.snapshotId !== property.provenance.snapshotId
    ) {
      throw new ExternalFailure({ kind: 'rejected', operation: 'properties.legacy-creation' });
    }
    await this.history.retainCreation(transaction, event);
  }
  private observe(
    chronology: ListingChronology,
    property: Property,
    original: CollectionSnapshotParsed,
    resolved: Property['resolved'],
    ids: readonly string[],
    legacy = false,
  ): readonly PropertiesEvent[] {
    const key = (event: CollectionSnapshotParsed) =>
      `${event.payload.source.observedAt}/${event.payload.snapshot.snapshotId}`;
    if (legacy && key(original) < key(property.initial)) {
      chronology.backfill(original, resolved);
      return [];
    }
    return chronology.observe(original, resolved, ids);
  }
  private async reconcile(
    run: CanonicalCompletedRun,
    identity: string,
    signal: AbortSignal,
  ): Promise<void> {
    await this.transactions.runInTransaction(async (transaction) => {
      if (!(await this.collection.verifyCompletedEvent(transaction, run.event)))
        throw new ExternalFailure({ kind: 'rejected', operation: 'properties.listing-history' });
      const facts = await this.collection.getRunListingFacts(transaction, run.runId, identity);
      await this.properties.lockSourceIdentity(transaction, run.sourceId, identity);
      if (await this.history.appliedRun(transaction, run.sourceId, identity, run.runId)) return;
      let loaded = await this.history.load(transaction, run.sourceId, identity);
      if (loaded?.state === null) await this.retainCreation(transaction, loaded.property);
      const events: PropertiesEvent[] = [];
      for (const fact of facts) {
        if (!(fact instanceof CollectionSnapshotParsed)) continue;
        const resolved = await this.resolve(transaction, fact);
        if (!(await this.properties.hasFact(transaction, fact.eventId)))
          await this.properties.appendFact(transaction, fact, 'pending-history');
        if (!loaded) {
          const property = new Property(
            await this.identifiers.generate(transaction),
            await this.identifiers.generate(transaction),
            fact,
            resolved,
          );
          await this.properties.create(transaction, property);
          events.push(property.creationEvent(await this.identifiers.generate(transaction)));
          loaded = { property, state: null };
        }
        const chronology = new ListingChronology(loaded.property, loaded.state, this.hash);
        const ids = [];
        for (let n = 0; n < 3; n++) ids.push(await this.identifiers.generate(transaction));
        events.push(...this.observe(chronology, loaded.property, fact, resolved, ids));
        await this.correct(transaction, chronology, fact.payload.snapshot.snapshotId);
        loaded = { property: loaded.property, state: chronology.state };
      }
      if (loaded) {
        const chronology = new ListingChronology(loaded.property, loaded.state, this.hash);
        if (!run.observedSourceListingIds.includes(identity)) {
          const removal = chronology.remove(
            run.completedAt,
            await this.identifiers.generate(transaction),
          );
          if (removal) events.push(removal);
        }
        await this.history.save(transaction, loaded.property, chronology.state, events);
        await this.publish(transaction, events);
      }
      await this.history.markRun(transaction, run.sourceId, identity, run.runId);
      signal.throwIfAborted();
    }, signal);
  }
}
