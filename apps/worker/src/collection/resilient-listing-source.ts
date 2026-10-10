import {
  ExternalFailure,
  ListingSourceAccessRefusal,
  type ListingSource,
  type RawListingDocument,
  type SourceRegisterRepository,
} from '@rei/application';
import type { SourceHold } from '@rei/domain';

import { CollectionDependencyPolicies } from './collection-dependency-policies';
import {
  listingSourceResilienceSettings,
  type CollectionResilienceSettings,
} from './collection-resilience.settings';

export class ResilientListingSource implements ListingSource {
  readonly #sources = new Map<string, CollectionDependencyPolicies>();
  readonly #pendingHolds = new Map<string, SourceHold>();
  public constructor(
    private readonly adapter: ListingSource,
    private readonly register: SourceRegisterRepository,
    private readonly settings: CollectionResilienceSettings = listingSourceResilienceSettings,
    private readonly now: () => number = Date.now,
    private readonly random: () => number = Math.random,
  ) {}

  public async fetchPage(
    sourceId: string,
    cursor: string | null,
    signal: AbortSignal,
    deadlineAt = Number.POSITIVE_INFINITY,
  ) {
    let policies = this.#sources.get(sourceId);
    if (!policies) {
      policies = new CollectionDependencyPolicies(this.settings, this.now, this.random);
      this.#sources.set(sourceId, policies);
    }
    const state = policies;
    return state.withinDeadline(
      async (scoped) => {
        const registration = await this.collectible(sourceId, scoped);
        state.configureRate(registration.rate);
        return state.execute(
          async (attempt) => {
            await this.collectible(sourceId, attempt);
            attempt.throwIfAborted();
            try {
              return await this.adapter.fetchPage(sourceId, cursor, attempt);
            } catch (error) {
              if (error instanceof ListingSourceAccessRefusal) {
                state.breaker.policy.trip();
                const hold = { reason: error.reason, heldAt: new Date(this.now()).toISOString() };
                this.#pendingHolds.set(sourceId, hold);
                await this.persistHold(sourceId, hold, attempt);
              }
              throw error;
            }
          },
          scoped,
          deadlineAt,
        );
      },
      signal,
      deadlineAt,
    );
  }

  public parse(document: RawListingDocument, signal: AbortSignal) {
    signal.throwIfAborted();
    return this.adapter.parse(document, signal);
  }

  public policiesFor(sourceId: string) {
    return this.#sources.get(sourceId);
  }

  private async collectible(sourceId: string, signal: AbortSignal) {
    signal.throwIfAborted();
    const pending = this.#pendingHolds.get(sourceId);
    if (pending) {
      await this.persistHold(sourceId, pending, signal);
      throw new ListingSourceAccessRefusal(pending.reason);
    }
    const source = await this.register.findById(sourceId, signal);
    signal.throwIfAborted();
    if (source?.hold) throw new ListingSourceAccessRefusal(source.hold.reason);
    if (!source?.enabled || !source.permissions.collectionAllowed)
      throw new ExternalFailure({ kind: 'forbidden', operation: 'collection.source.fetch-page' });
    return source;
  }

  private async persistHold(sourceId: string, hold: SourceHold, signal: AbortSignal) {
    try {
      const held = await this.register.holdAtomically(sourceId, hold, signal);
      signal.throwIfAborted();
      if (!held?.hold) throw new Error('Source hold could not be persisted.');
      this.#pendingHolds.delete(sourceId);
    } catch {
      if (signal.aborted)
        throw new ExternalFailure({ kind: 'cancelled', operation: 'collection.source.fetch-page' });
      throw new ExternalFailure({ kind: 'exhausted', operation: 'collection.source.fetch-page' });
    }
  }
}
