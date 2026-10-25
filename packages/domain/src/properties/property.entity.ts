import { parseCollectionEvent, CollectionSnapshotParsed } from '../collection/index.js';
import type { PlaceRef } from '../locations/index.js';
import { DomainValidationError, parseUuidV7, type UuidV7 } from '../shared/index.js';
import { PropertiesEvent } from './properties.events.js';
import type { ListingProvenance } from './properties.read.types.js';
import { NormalizedListing } from './listing/normalized-listing.vo.js';

/** A resolved fixture address is reference geography, never inferred entity matching. */
export interface ResolvedPropertyPlace {
  readonly place: PlaceRef;
  readonly breadcrumbs: readonly PlaceRef[];
}

function placeReference(value: PlaceRef): PlaceRef {
  if (
    Object.keys(value).sort().join(',') !== 'id,kind,name' ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.id) ||
    !['country', 'state', 'city', 'zone', 'neighborhood', 'street-block'].includes(value.kind) ||
    Object.keys(value.name).sort().join(',') !== 'en,ptBR' ||
    [value.name.en, value.name.ptBR].some(
      (text) => typeof text !== 'string' || !text || text.length > 300,
    )
  )
    throw new DomainValidationError('Invalid resolved place reference.', 'place');
  return Object.freeze({ id: value.id, kind: value.kind, name: Object.freeze({ ...value.name }) });
}

/** Initial single-listing aggregate. Later observations are deliberately separate immutable facts. */
export class Property {
  public readonly propertyId: UuidV7;
  public readonly listingId: UuidV7;
  public readonly initial: CollectionSnapshotParsed;
  public readonly resolved: ResolvedPropertyPlace;
  public readonly provenance: ListingProvenance;
  public readonly normalized: NormalizedListing;

  public constructor(
    propertyId: string,
    listingId: string,
    event: unknown,
    resolved: ResolvedPropertyPlace,
  ) {
    this.propertyId = parseUuidV7(propertyId);
    this.listingId = parseUuidV7(listingId);
    if (this.propertyId === this.listingId)
      throw new DomainValidationError(
        'Property and Listing identities must be distinct.',
        'listingId',
      );
    const initial = parseCollectionEvent(
      event instanceof CollectionSnapshotParsed ? { ...event } : event,
    );
    if (!(initial instanceof CollectionSnapshotParsed))
      throw new DomainValidationError('Expected an acquisition fact.', 'event');
    this.initial = initial;
    const breadcrumbs = resolved.breadcrumbs.map(placeReference);
    const place = placeReference(resolved.place);
    const kinds = ['country', 'state', 'city', 'zone', 'neighborhood', 'street-block'];
    if (
      Object.keys(resolved).sort().join(',') !== 'breadcrumbs,place' ||
      !['neighborhood', 'street-block'].includes(place.kind) ||
      breadcrumbs.length !== kinds.indexOf(place.kind) + 1 ||
      breadcrumbs.some((crumb, index) => crumb.kind !== kinds[index]) ||
      new Set(breadcrumbs.map((crumb) => crumb.id)).size !== breadcrumbs.length ||
      JSON.stringify(breadcrumbs.at(-1)) !== JSON.stringify(place)
    )
      throw new DomainValidationError('Invalid resolved place hierarchy.', 'place');
    this.resolved = Object.freeze({ place, breadcrumbs: Object.freeze(breadcrumbs) });
    this.normalized = new NormalizedListing(this.initial);
    this.provenance = this.normalized.provenance;
    Object.freeze(this);
  }

  public creationEvent(eventId: string): PropertiesEvent<'properties.listing.created'> {
    const listing = this.normalized;
    const effectiveAt = this.provenance.observedAt;
    return new PropertiesEvent('properties.listing.created', {
      eventId,
      aggregateId: this.listingId,
      occurredAt: effectiveAt,
      traceContext: this.initial.traceContext,
      payload: {
        revision: 1,
        effectiveAt,
        listing: {
          listingId: this.listingId,
          propertyId: this.propertyId,
          sourceId: this.provenance.sourceId,
          sourceListingId: this.provenance.sourceListingId,
          placeId: this.resolved.place.id,
          propertyType: listing.propertyType.value,
          areaSquareMeters: listing.areaSquareMeters.value,
          status: 'active',
          askingPriceMinorUnits: listing.askingPriceMinorUnits.value,
          currency: listing.currency.value,
          effectiveAt,
          provenance: this.provenance,
        },
      },
    });
  }
}
