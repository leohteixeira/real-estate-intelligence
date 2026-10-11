import {
  CollectionSnapshotParsed,
  CollectionSnapshotCorrected,
  parseCollectionEvent,
} from '../../collection/index.js';
import { DomainValidationError } from '../../shared/index.js';
import { PropertiesEvent, type PropertiesEventType } from '../properties.events.js';
import type { Property, ResolvedPropertyPlace } from '../property.entity.js';
import type { ListingHistory, ListingProvenance } from '../properties.read.types.js';
import { NormalizedListing } from './normalized-listing.vo.js';

export interface ListingAcquisition {
  readonly original: CollectionSnapshotParsed;
  readonly corrected: CollectionSnapshotCorrected | null;
  readonly resolved: ResolvedPropertyPlace;
  readonly originalResolved: ResolvedPropertyPlace;
}
export interface ListingChronologyState {
  readonly acquisitions: readonly ListingAcquisition[];
  /** Last original applied in canonical run/fact order, independent of dated value selection. */
  readonly canonicalSnapshotId: string;
  readonly history: readonly ListingHistory[];
  readonly revision: number;
  readonly status: 'active' | 'removed';
  /** Canonical constituent activity periods; the public union is derived only on reads. */
  readonly lifeline: readonly { readonly from: string; readonly to: string | null }[];
}

/** Active exposure is a temporal union, independent of market-event publication order. */
export function unionListingLifelines(
  intervals: ListingChronologyState['lifeline'],
): ListingChronologyState['lifeline'] {
  const union: { from: string; to: string | null }[] = [];
  for (const interval of [...intervals]
    .filter((item) => item.to === null || Date.parse(item.to) >= Date.parse(item.from))
    .sort((a, b) => Date.parse(a.from) - Date.parse(b.from))) {
    const prior = union.at(-1);
    if (!prior || (prior.to !== null && Date.parse(interval.from) > Date.parse(prior.to))) {
      union.push({ ...interval });
    } else {
      prior.to =
        prior.to === null || interval.to === null
          ? null
          : Date.parse(prior.to) >= Date.parse(interval.to)
            ? prior.to
            : interval.to;
    }
  }
  return union;
}

/** Original acquisitions drive immutable market effects; corrections only select dated values. */
export class ListingChronology {
  public state: ListingChronologyState;
  public constructor(
    private readonly property: Property,
    state: ListingChronologyState | null,
    private readonly hash: (text: string) => string,
  ) {
    this.state = state ?? {
      acquisitions: [
        {
          original: property.initial,
          corrected: null,
          resolved: property.resolved,
          originalResolved: property.resolved,
        },
      ],
      canonicalSnapshotId: property.initial.payload.snapshot.snapshotId,
      history: [
        {
          type: 'created',
          effectiveAt: property.provenance.observedAt,
          provenance: property.provenance,
        },
      ],
      revision: 1,
      status: 'active',
      lifeline: [{ from: property.provenance.observedAt, to: null }],
    };
  }
  /** Legacy-only evidence before the immutable published creation frontier emits no market event. */
  public backfill(input: CollectionSnapshotParsed, resolved: ResolvedPropertyPlace): boolean {
    const event = parseCollectionEvent({ ...input });
    if (!(event instanceof CollectionSnapshotParsed))
      throw new DomainValidationError('Expected original acquisition.', 'event');
    const normalized = new NormalizedListing(event);
    if (
      normalized.provenance.sourceId !== this.property.provenance.sourceId ||
      normalized.provenance.sourceListingId !== this.property.provenance.sourceListingId
    )
      throw new DomainValidationError('Acquisition changed stable source identity.', 'event');
    const key = (original: CollectionSnapshotParsed) =>
      [original.payload.source.observedAt, original.payload.snapshot.snapshotId].join('/');
    if (key(event) >= key(this.property.initial))
      throw new DomainValidationError(
        'Backfill must precede the published creation frontier.',
        'observedAt',
      );
    if (
      this.state.acquisitions.some(
        (item) => item.original.payload.snapshot.snapshotId === event.payload.snapshot.snapshotId,
      )
    )
      return false;
    const acquisitions = [
      ...this.state.acquisitions,
      { original: event, corrected: null, resolved, originalResolved: resolved },
    ].sort((left, right) => key(left.original).localeCompare(key(right.original)));
    this.state = {
      ...this.state,
      acquisitions,
      lifeline: this.state.lifeline.map((interval, index) =>
        index === 0
          ? { ...interval, from: acquisitions[0]!.original.payload.source.observedAt }
          : interval,
      ),
    };
    return true;
  }
  public observe(
    original: CollectionSnapshotParsed,
    resolved: ResolvedPropertyPlace,
    identifiers: readonly string[],
  ): readonly PropertiesEvent[] {
    const event = parseCollectionEvent({ ...original });
    if (!(event instanceof CollectionSnapshotParsed))
      throw new DomainValidationError('Expected original acquisition.', 'event');
    const normalized = new NormalizedListing(event);
    if (
      normalized.provenance.sourceId !== this.property.provenance.sourceId ||
      normalized.provenance.sourceListingId !== this.property.provenance.sourceListingId
    )
      throw new DomainValidationError('Acquisition changed stable source identity.', 'event');
    if (
      this.state.acquisitions.some(
        (item) => item.original.payload.snapshot.snapshotId === event.payload.snapshot.snapshotId,
      )
    )
      return [];
    const prior = this.canonicalAcquisition();
    const old = new NormalizedListing(prior.original);
    const emitted: PropertiesEvent[] = [];
    const history = [...this.state.history];
    const lifeline = this.state.lifeline.map((item) => ({ ...item }));
    let revision = this.state.revision;
    const effectiveAt = normalized.provenance.observedAt;
    const emit = (
      type: PropertiesEventType,
      entry: ListingHistory,
      extra: Record<string, string | number> = {},
    ) => {
      const id = identifiers[emitted.length];
      if (!id) throw new DomainValidationError('Missing event identity.', 'eventId');
      emitted.push(
        new PropertiesEvent(type, {
          eventId: id,
          aggregateId: this.property.listingId,
          occurredAt: effectiveAt,
          traceContext: event.traceContext,
          payload: {
            revision: ++revision,
            effectiveAt,
            listing: {
              listingId: this.property.listingId,
              propertyId: this.property.propertyId,
              sourceId: normalized.provenance.sourceId,
              sourceListingId: normalized.provenance.sourceListingId,
              placeId: resolved.place.id,
              propertyType: normalized.propertyType.value,
              areaSquareMeters: normalized.areaSquareMeters.value,
              status: 'active',
              askingPriceMinorUnits: normalized.askingPriceMinorUnits.value,
              currency: 'BRL',
              effectiveAt,
              provenance: normalized.provenance,
            },
            ...extra,
          },
        }),
      );
      history.push(entry);
    };
    if (this.state.status === 'removed') {
      emit('properties.listing.reappeared', {
        type: 'reappeared',
        effectiveAt,
        provenance: normalized.provenance,
      });
      lifeline.push({ from: effectiveAt, to: null });
    }
    if (old.askingPriceMinorUnits.value !== normalized.askingPriceMinorUnits.value)
      emit(
        'properties.listing.price-changed',
        {
          type: 'price-changed',
          effectiveAt,
          previousMinorUnits: old.askingPriceMinorUnits.value,
          currentMinorUnits: normalized.askingPriceMinorUnits.value,
          provenance: normalized.provenance,
        },
        { previousMinorUnits: old.askingPriceMinorUnits.value },
      );
    const beforeHash = this.hash(old.maskedDescription.value),
      afterHash = this.hash(normalized.maskedDescription.value);
    if (beforeHash !== afterHash)
      emit(
        'properties.listing.description-changed',
        {
          type: 'description-changed',
          effectiveAt,
          beforeHash,
          afterHash,
          provenance: normalized.provenance,
        },
        { beforeHash, afterHash },
      );
    const acquisitions = [
      ...this.state.acquisitions,
      { original: event, corrected: null, resolved, originalResolved: resolved },
    ].sort((left, right) =>
      acquisitionKey(left.original).localeCompare(acquisitionKey(right.original)),
    );
    const open = lifeline.at(-1);
    if (open?.to === null && Date.parse(effectiveAt) < Date.parse(open.from))
      open.from = effectiveAt;
    this.state = {
      ...this.state,
      revision,
      status: 'active',
      history,
      lifeline,
      acquisitions,
      canonicalSnapshotId: event.payload.snapshot.snapshotId,
    };
    return emitted;
  }
  public remove(completedAt: string, eventId: string): PropertiesEvent | null {
    if (this.state.status === 'removed') return null;
    // Completion authority cannot use evidence observed in its future, or corrected values.
    const current = [...this.state.acquisitions]
      .reverse()
      .find(
        (item) => Date.parse(item.original.payload.source.observedAt) <= Date.parse(completedAt),
      );
    if (!current) return null;
    const original = new NormalizedListing(current.original);
    const provenance: ListingProvenance = original.provenance;
    const revision = this.state.revision + 1;
    const event = new PropertiesEvent('properties.listing.removed', {
      eventId,
      aggregateId: this.property.listingId,
      occurredAt: completedAt,
      traceContext: current.original.traceContext,
      payload: {
        revision,
        effectiveAt: completedAt,
        listing: {
          listingId: this.property.listingId,
          propertyId: this.property.propertyId,
          sourceId: provenance.sourceId,
          sourceListingId: provenance.sourceListingId,
          placeId: current.originalResolved.place.id,
          propertyType: original.propertyType.value,
          areaSquareMeters: original.areaSquareMeters.value,
          status: 'removed',
          askingPriceMinorUnits: original.askingPriceMinorUnits.value,
          currency: 'BRL',
          effectiveAt: completedAt,
          provenance,
        },
      },
    });
    this.state = {
      ...this.state,
      revision,
      status: 'removed',
      history: [...this.state.history, { type: 'removed', effectiveAt: completedAt, provenance }],
      lifeline: this.state.lifeline.map((item, index) =>
        index === this.state.lifeline.length - 1 ? { ...item, to: completedAt } : item,
      ),
    };
    return event;
  }
  public correct(input: CollectionSnapshotCorrected, resolved: ResolvedPropertyPlace): boolean {
    const event = parseCollectionEvent({ ...input });
    if (!(event instanceof CollectionSnapshotCorrected))
      throw new DomainValidationError('Expected correction.', 'event');
    new NormalizedListing(event);
    const index = this.state.acquisitions.findIndex(
      (item) =>
        item.original.eventId === event.payload.correction.originalParsedEventId &&
        item.original.payload.snapshot.snapshotId === event.payload.snapshot.snapshotId,
    );
    if (index < 0) return false;
    const prior = this.state.acquisitions[index]!;
    if (
      prior.corrected &&
      prior.corrected.payload.correction.order >= event.payload.correction.order
    )
      return false;
    // JSONB reorders object keys; provenance equality is about values, not serialization order.
    const before = prior.original.payload,
      after = event.payload;
    if (
      before.source.sourceId !== after.source.sourceId ||
      before.source.sourceListingId !== after.source.sourceListingId ||
      before.source.sourceUrl !== after.source.sourceUrl ||
      before.source.observedAt !== after.source.observedAt ||
      before.run.runId !== after.run.runId ||
      before.snapshot.snapshotId !== after.snapshot.snapshotId ||
      before.snapshot.contentHash !== after.snapshot.contentHash
    )
      throw new DomainValidationError(
        'Correction changed original acquisition provenance.',
        'provenance',
      );
    this.state = {
      ...this.state,
      acquisitions: this.state.acquisitions.map((item, i) =>
        i === index ? { ...item, corrected: event, resolved } : item,
      ),
    };
    return true;
  }
  private canonicalAcquisition(): ListingAcquisition {
    // Older retained states used chronological append order before the frontier was explicit.
    return (
      this.state.acquisitions.find(
        (item) => item.original.payload.snapshot.snapshotId === this.state.canonicalSnapshotId,
      ) ?? this.state.acquisitions.at(-1)!
    );
  }
}

function acquisitionKey(event: CollectionSnapshotParsed): string {
  return `${event.payload.source.observedAt}/${event.payload.snapshot.snapshotId}`;
}
