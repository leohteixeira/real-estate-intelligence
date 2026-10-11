import { describe, expect, it } from 'vitest';
import { DomainValidationError } from '../../shared/index.js';
import { NormalizedListing } from './normalized-listing.vo.js';

const id = (n: number) => `0199c8f2-2394-7000-8000-${String(n).padStart(12, '0')}`;
const wire = () => ({
  eventId: id(3),
  type: 'collection.snapshot.parsed',
  version: 1,
  aggregateId: id(2),
  occurredAt: '2026-10-10T14:00:00.000Z',
  traceContext: null,
  payload: {
    run: { runId: id(1) },
    snapshot: { snapshotId: id(2), contentHash: `sha256:${'a'.repeat(64)}` },
    source: {
      sourceId: 'synthetic-data',
      sourceListingId: 'SYN-NORMALIZED',
      sourceUrl: 'https://synthetic.invalid/listings/SYN-NORMALIZED',
      observedAt: '2026-10-10T12:00:00.000Z',
    },
    listing: {
      propertyType: 'apartment',
      askingPriceMinorUnits: 78500000,
      currency: 'BRL',
      areaSquareMeters: 82.5,
      bedrooms: 0,
      bathrooms: 0,
      parkingSpaces: 0,
      features: [' Pool ', 'POOL', 'Cafe\u0301', 'CAFÉ', '  custom\t feature  '],
      location: {
        city: 'São Paulo',
        stateCode: 'SP',
        neighborhood: 'Bela Vista',
        street: 'Published synthetic street',
      },
      listedAt: '2026-10-01T12:00:00.000Z',
      advertiser: { type: 'private', agencyName: null },
      maskedDescription: 'Contact [REDACTED].',
      imageFingerprints: ['synthetic-prepared-fingerprint'],
    },
  },
});

describe('NormalizedListing', () => {
  it('composes immutable allowed values with original source, URL and acquisition time', () => {
    const original = wire();
    const before = JSON.stringify(original);
    const model = new NormalizedListing(original);
    expect(model.propertyType.value).toBe('apartment');
    expect(model.askingPriceMinorUnits.value).toBe(78500000);
    expect(model.currency.value).toBe('BRL');
    expect(model.areaSquareMeters.value).toBe(82.5);
    expect([model.bedrooms.value, model.bathrooms.value, model.parkingSpaces.value]).toEqual([
      0, 0, 0,
    ]);
    expect(model.features.map((item) => item.value)).toEqual(['pool', 'café', 'custom feature']);
    expect(model.location.street.value).toBe('Published synthetic street');
    expect(model.advertiser.agencyName.value).toBeNull();
    expect(model.listedAt.value).toBe(original.payload.listing.listedAt);
    expect(model.maskedDescription.value).toBe('Contact [REDACTED].');
    expect(model.imageFingerprints[0]!.value).toBe('synthetic-prepared-fingerprint');
    const values = [
      model.propertyType,
      model.askingPriceMinorUnits,
      model.currency,
      model.areaSquareMeters,
      model.bedrooms,
      model.bathrooms,
      model.parkingSpaces,
      ...model.features,
      ...Object.values(model.location),
      model.listedAt,
      ...Object.values(model.advertiser),
      model.maskedDescription,
      ...model.imageFingerprints,
      model.sourceId,
      model.sourceListingId,
      model.sourceUrl,
      model.observedAt,
    ];
    for (const value of values) {
      expect(value.source).toBe(original.payload.source.sourceId);
      expect(value.sourceUrl).toBe(original.payload.source.sourceUrl);
      expect(value.collectedAt).toBe(original.payload.source.observedAt);
      expect(Object.isFrozen(value)).toBe(true);
    }
    expect(model.provenance).toEqual({
      ...original.payload.source,
      ...original.payload.run,
      ...original.payload.snapshot,
    });
    expect(Object.isFrozen(model)).toBe(true);
    expect(Object.isFrozen(model.features)).toBe(true);
    expect(Object.isFrozen(model.location)).toBe(true);
    expect(Object.isFrozen(model.advertiser)).toBe(true);
    expect(JSON.stringify(original)).toBe(before);
    original.payload.listing.features.push('caller-only');
    expect(model.features.map((item) => item.value)).not.toContain('caller-only');
  });
  it('retains unknown features, locale-free case conversion, order, agency names and empty feature arrays', () => {
    const original = wire();
    original.payload.listing.features = ['Zeta', 'İ', 'UNKNOWN amenity', 'zeta'];
    original.payload.listing.advertiser = { type: 'agency', agencyName: 'Synthetic Agency' };
    const model = new NormalizedListing(original);
    expect(model.features.map((item) => item.value)).toEqual([
      'zeta',
      'i\u0307',
      'unknown amenity',
    ]);
    expect(model.advertiser.type.value).toBe('agency');
    expect(model.advertiser.agencyName.value).toBe('Synthetic Agency');
    original.payload.listing.features = [];
    expect(new NormalizedListing(original).features).toEqual([]);
  });
  it('restores NFC after lowercase and deduplicates equivalent features in first-occurrence order', () => {
    const original = wire();
    original.payload.listing.features = ['Zeta', 'J\u030C', 'Unknown amenity', '\u01F0'];
    const before = JSON.stringify(original);
    const features = new NormalizedListing(original).features.map((item) => item.value);
    expect(features).toEqual(['zeta', '\u01F0', 'unknown amenity']);
    expect(features.every((feature) => feature === feature.normalize('NFC'))).toBe(true);
    expect(JSON.stringify(original)).toBe(before);
  });
  it.each(['   ', 'İ'.repeat(100), 'x'.repeat(101)])(
    'rejects empty or oversized normalized features (%s)',
    (feature) => {
      const original = wire();
      original.payload.listing.features = [feature];
      expect(() => new NormalizedListing(original)).toThrow(DomainValidationError);
    },
  );
  it.each([
    { askingPriceMinorUnits: undefined },
    { askingPriceMinorUnits: '100' },
    { currency: 'USD' },
    { askingPriceMinorUnits: 0 },
    { askingPriceMinorUnits: -1 },
    { askingPriceMinorUnits: Number.MAX_SAFE_INTEGER + 1 },
    { areaSquareMeters: NaN },
    { areaSquareMeters: Infinity },
    { bedrooms: 1.5 },
    { bathrooms: undefined },
    { parkingSpaces: -1 },
    { propertyType: 'studio' },
    { contactName: 'Someone' },
    { photos: [] },
    { maskedDescription: 'Contact test@example.invalid' },
    { features: ['same', 'same'] },
  ])('rejects noncanonical or forbidden values without conversion (%j)', (change) => {
    const original = wire();
    expect(
      () =>
        new NormalizedListing({
          ...original,
          payload: { ...original.payload, listing: { ...original.payload.listing, ...change } },
        }),
    ).toThrow(DomainValidationError);
  });
});
