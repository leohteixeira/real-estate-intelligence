import {
  CollectionSnapshotParsed,
  parseCollectionSnapshotParsed,
  type CollectionPropertyType,
  type CollectionAdvertiserType,
} from '../../collection/index.js';
import {
  DomainValidationError,
  Money,
  Provenance,
  type SerializableValue,
} from '../../shared/index.js';
import type { ListingProvenance } from '../properties.read.types.js';

/** Properties-owned values derived from an unchanged, strictly validated initial Collection fact. */
export class NormalizedListing {
  public readonly propertyType: Provenance<CollectionPropertyType>;
  public readonly askingPriceMinorUnits: Provenance<number>;
  public readonly currency: Provenance<'BRL'>;
  public readonly areaSquareMeters: Provenance<number>;
  public readonly bedrooms: Provenance<number>;
  public readonly bathrooms: Provenance<number>;
  public readonly parkingSpaces: Provenance<number>;
  public readonly features: readonly Provenance<string>[];
  public readonly location: Readonly<{
    city: Provenance<string>;
    stateCode: Provenance<string>;
    neighborhood: Provenance<string>;
    street: Provenance<string>;
  }>;
  public readonly listedAt: Provenance<string>;
  public readonly advertiser: Readonly<{
    type: Provenance<CollectionAdvertiserType>;
    agencyName: Provenance<string | null>;
  }>;
  public readonly maskedDescription: Provenance<string>;
  public readonly imageFingerprints: readonly Provenance<string>[];
  public readonly sourceId: Provenance<string>;
  public readonly sourceListingId: Provenance<string>;
  public readonly sourceUrl: Provenance<string>;
  public readonly observedAt: Provenance<string>;
  public readonly provenance: ListingProvenance;

  public constructor(original: unknown) {
    const event = parseCollectionSnapshotParsed(
      original instanceof CollectionSnapshotParsed ? { ...original } : original,
    );
    const { listing, source, run, snapshot } = event.payload;
    const value = <T extends SerializableValue>(item: T): Provenance<T> =>
      new Provenance({
        value: item,
        source: source.sourceId,
        sourceUrl: source.sourceUrl,
        collectedAt: source.observedAt,
      });
    // Collection enforces positive cents, required numeric values and canonical units first.
    const money = new Money(listing.askingPriceMinorUnits, listing.currency);
    this.propertyType = value(listing.propertyType);
    this.askingPriceMinorUnits = value(money.minorUnits);
    this.currency = value(money.currency);
    this.areaSquareMeters = value(listing.areaSquareMeters);
    this.bedrooms = value(listing.bedrooms);
    this.bathrooms = value(listing.bathrooms);
    this.parkingSpaces = value(listing.parkingSpaces);
    const features = listing.features.map((feature) => {
      const normalized = feature
        .normalize('NFC')
        .trim()
        .replace(/\s+/gu, ' ')
        .toLowerCase()
        .normalize('NFC');
      if (!normalized || normalized.length > 100)
        throw new DomainValidationError('Invalid normalized listing feature.', 'features');
      return normalized;
    });
    this.features = Object.freeze([...new Set(features)].map(value));
    this.location = Object.freeze({
      city: value(listing.location.city),
      stateCode: value(listing.location.stateCode),
      neighborhood: value(listing.location.neighborhood),
      street: value(listing.location.street),
    });
    this.listedAt = value(listing.listedAt);
    this.advertiser = Object.freeze({
      type: value(listing.advertiser.type),
      agencyName: value(listing.advertiser.agencyName),
    });
    this.maskedDescription = value(listing.maskedDescription);
    this.imageFingerprints = Object.freeze(listing.imageFingerprints.map(value));
    this.sourceId = value(source.sourceId);
    this.sourceListingId = value(source.sourceListingId);
    this.sourceUrl = value(source.sourceUrl);
    this.observedAt = value(source.observedAt);
    this.provenance = Object.freeze({ ...source, ...run, ...snapshot });
    Object.freeze(this);
  }
}
