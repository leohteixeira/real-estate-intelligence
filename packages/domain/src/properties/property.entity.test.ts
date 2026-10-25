import { describe, expect, it } from 'vitest';
import {
  CollectionSnapshotParsed,
  CollectionSnapshotAcquired,
  CollectionSnapshotPerceptuallyCorrected,
} from '../collection/index.js';
import type { ResolvedPropertyPlace } from './property.entity.js';
import { Property } from './property.entity.js';

const id = (value: number) => `0199c8f2-2394-7000-8000-${String(value).padStart(12, '0')}`;
const refs: ResolvedPropertyPlace = {
  place: { id: 'district', kind: 'neighborhood', name: { en: 'District', ptBR: 'District' } },
  breadcrumbs: ['country', 'state', 'city', 'zone', 'neighborhood'].map((kind, index) => ({
    id: index === 4 ? 'district' : kind,
    kind,
    name: { en: index === 4 ? 'District' : kind, ptBR: index === 4 ? 'District' : kind },
  })) as ResolvedPropertyPlace['breadcrumbs'],
};
const event = new CollectionSnapshotParsed({
  eventId: id(3),
  aggregateId: id(2),
  occurredAt: '2026-10-10T12:01:00.000Z',
  payload: {
    run: { runId: id(1) as CollectionSnapshotParsed['payload']['run']['runId'] },
    snapshot: {
      snapshotId: id(2) as CollectionSnapshotParsed['payload']['snapshot']['snapshotId'],
      contentHash: `sha256:${'a'.repeat(64)}`,
    },
    source: {
      sourceId: 'synthetic-data',
      sourceListingId: 'SYN-SP-0001',
      sourceUrl: 'https://synthetic.invalid/SYN-SP-0001',
      observedAt: '2026-10-10T12:00:00.000Z',
    },
    listing: {
      propertyType: 'apartment',
      askingPriceMinorUnits: 78500000,
      currency: 'BRL',
      areaSquareMeters: 82.5,
      bedrooms: 2,
      bathrooms: 2,
      parkingSpaces: 1,
      features: ['balcony'],
      location: {
        city: 'São Paulo',
        stateCode: 'SP',
        neighborhood: 'Bela Vista',
        street: 'Avenida Exemplo',
      },
      listedAt: '2026-10-01T12:00:00.000Z',
      advertiser: { type: 'private', agencyName: null },
      maskedDescription: 'Synthetic description.',
      imageFingerprints: ['synthetic-fingerprint'],
    },
  },
});

describe('initial Property aggregate', () => {
  it('keeps distinct identities and immutable canonical data detached from callers', () => {
    const supplied = JSON.parse(JSON.stringify(refs)) as ResolvedPropertyPlace;
    const property = new Property(id(10), id(11), event, supplied);
    expect(property.propertyId).not.toBe(property.listingId);
    expect(Object.isFrozen(property)).toBe(true);
    expect(Object.isFrozen(property.resolved.breadcrumbs[0]!.name)).toBe(true);
    expect(Object.isFrozen(property.initial.payload.listing.features)).toBe(true);
    expect(property.provenance.contentHash).toBe(event.payload.snapshot.contentHash);
  });
  it('creates one revision-1 listing fact using observation time rather than publication time', () => {
    const property = new Property(id(10), id(11), event, refs);
    const creation = property.creationEvent(id(12));
    expect(creation.type).toBe('properties.listing.created');
    expect(creation.version).toBe(1);
    expect(creation.occurredAt).toBe(event.payload.source.observedAt);
    expect(creation.payload.listing.askingPriceMinorUnits).toBe(78500000);
    expect(creation.payload.listing.provenance).toEqual(property.provenance);
    expect(creation.payload.listing.placeId).toBe('district');
  });
  it('normalizes its owned view without changing the original event or published address', () => {
    const original = {
      ...event,
      payload: {
        ...event.payload,
        listing: { ...event.payload.listing, features: [' Pool ', 'POOL', 'Unknown\t amenity'] },
      },
    };
    const before = JSON.stringify(original);
    const property = new Property(id(10), id(11), original, refs);
    expect(JSON.stringify(property.initial)).toBe(before);
    expect(JSON.stringify(original)).toBe(before);
    expect(property.normalized.features.map((feature) => feature.value)).toEqual([
      'pool',
      'unknown amenity',
    ]);
    expect(property.normalized.location.street.value).toBe('Avenida Exemplo');
    expect(property.resolved.place.name.en).toBe('District');
    expect(property.normalized.areaSquareMeters.collectedAt).toBe(event.payload.source.observedAt);
    expect(property.creationEvent(id(12))).toEqual(
      new Property(id(10), id(11), event, refs).creationEvent(id(12)),
    );
  });
  it('rejects overlapping identities, noncanonical input and invented place hierarchies', () => {
    expect(() => new Property(id(10), id(10), event, refs)).toThrow();
    expect(() => new Property(id(10), id(11), { ...event, extra: true }, refs)).toThrow();
    expect(() => new Property(id(10), id(11), event, { ...refs, breadcrumbs: [] })).toThrow();
    expect(
      () =>
        new Property(id(10), id(11), event, { ...refs, place: { ...refs.place, kind: 'city' } }),
    ).toThrow();
  });
});

it('initializes v3 perceptual evidence and refuses a v4 correction as a new Property', () => {
  const acquired = new CollectionSnapshotAcquired({
    ...event,
    payload: {
      ...event.payload,
      listing: {
        ...event.payload.listing,
        imageFingerprints: ['dhash64-v1:0000000000000000', 'dhash64-v1:0000000000000000'],
      },
    },
  });
  const property = new Property(id(10), id(11), acquired, refs);
  expect(property.initial.version).toBe(3);
  expect(property.normalized.imageFingerprints.map((entry) => entry.value)).toEqual(
    acquired.payload.listing.imageFingerprints,
  );
  const correction = new CollectionSnapshotPerceptuallyCorrected({
    ...acquired,
    eventId: id(20),
    payload: {
      ...acquired.payload,
      correction: {
        kind: 'parser-correction',
        operationKey: 'reparse',
        parserRevision: 'revision-2',
        originalParsedEventId: acquired.eventId,
        order: 1,
      },
    },
  });
  expect(() => new Property(id(10), id(11), correction, refs)).toThrow();
});
