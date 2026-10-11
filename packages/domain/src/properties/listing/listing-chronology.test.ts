import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CollectionSnapshotCorrected, CollectionSnapshotParsed } from '../../collection/index.js';
import { parseUuidV7 } from '../../shared/index.js';
import { Property, type ResolvedPropertyPlace } from '../property.entity.js';
import { ListingChronology, unionListingLifelines } from './listing-chronology.js';
import { NormalizedListing } from './normalized-listing.vo.js';

const id = (n: number) => parseUuidV7(`0199c8f2-2394-7000-8000-${String(n).padStart(12, '0')}`);
const date = (n: number) => `2026-10-${String(n).padStart(2, '0')}T12:00:00.000Z`;
const hash = (text: string) => `sha256:${createHash('sha256').update(text).digest('hex')}`;
const resolved: ResolvedPropertyPlace = {
  place: {
    id: 'neighborhood',
    kind: 'neighborhood',
    name: { en: 'neighborhood', ptBR: 'neighborhood' },
  },
  breadcrumbs: (['country', 'state', 'city', 'zone', 'neighborhood'] as const).map((kind) => ({
    id: kind,
    kind,
    name: { en: kind, ptBR: kind },
  })),
};
function original(
  n: number,
  price = 100,
  description = 'Original synthetic description.',
  bedrooms = 1,
) {
  return new CollectionSnapshotParsed({
    eventId: id(n * 10 + 1),
    aggregateId: id(n * 10 + 2),
    occurredAt: date(n),
    payload: {
      run: { runId: id(n * 10) },
      snapshot: { snapshotId: id(n * 10 + 2), contentHash: hash(`snapshot-${n}`) },
      source: {
        sourceId: 'synthetic-data',
        sourceListingId: 'HISTORY-OWNED',
        sourceUrl: 'https://synthetic.invalid/history',
        observedAt: date(n),
      },
      listing: {
        propertyType: 'apartment',
        askingPriceMinorUnits: price,
        currency: 'BRL',
        areaSquareMeters: 50,
        bedrooms,
        bathrooms: 1,
        parkingSpaces: 0,
        features: [' Pool ', 'POOL'],
        location: {
          city: 'São Paulo',
          stateCode: 'SP',
          neighborhood: 'Bela Vista',
          street: 'Avenida Exemplo',
        },
        listedAt: date(1),
        advertiser: { type: 'private', agencyName: null },
        maskedDescription: description,
        imageFingerprints: ['fixture-history-fingerprint'],
      },
    },
  });
}
const ids = [id(101), id(102), id(103)];
function chronology() {
  const event = original(1);
  return new ListingChronology(new Property(id(1000), id(1001), event, resolved), null, hash);
}
function correction(
  event: CollectionSnapshotParsed,
  order: number,
  price = 999,
  description = 'Corrected synthetic description.',
) {
  return new CollectionSnapshotCorrected({
    eventId: id(300 + order),
    aggregateId: event.aggregateId,
    occurredAt: date(10),
    payload: {
      ...event.payload,
      listing: {
        ...event.payload.listing,
        askingPriceMinorUnits: price,
        maskedDescription: description,
      },
      correction: {
        originalParsedEventId: event.eventId,
        kind: 'parser-correction',
        operationKey: `owned-correction-${order}`,
        parserRevision: `parser-${order}`,
        order,
      },
    },
  });
}

describe('immutable original listing chronology and corrected dated values', () => {
  it('keeps a closed creation period when a later canonical return predates creation', () => {
    const initial = original(3);
    const listing = new ListingChronology(
      new Property(id(1000), id(1001), initial, resolved),
      null,
      hash,
    );
    listing.remove(date(4), id(200));
    listing.observe(original(1), resolved, ids);
    listing.remove(date(2), id(201));
    expect(listing.state.lifeline).toEqual([
      { from: date(3), to: date(4) },
      { from: date(1), to: date(2) },
    ]);
    const union = unionListingLifelines(listing.state.lifeline);
    expect(union).toEqual([
      { from: date(1), to: date(2) },
      { from: date(3), to: date(4) },
    ]);
    const exposureDays = union.reduce(
      (days, interval) => days + (Date.parse(interval.to!) - Date.parse(interval.from)) / 86400000,
      0,
    );
    expect(exposureDays).toBe(2);
  });
  it('extends only the open period with the incoming observation rather than the earliest acquisition', () => {
    const listing = chronology();
    listing.remove(date(2), id(200));
    listing.observe(original(4), resolved, ids);
    listing.observe(original(3), resolved, ids);
    expect(listing.state.lifeline).toEqual([
      { from: date(1), to: date(2) },
      { from: date(3), to: null },
    ]);
  });
  it('removes using the latest eligible original, independent of future frontier and corrections', () => {
    const listing = chronology();
    listing.observe(original(10, 110), resolved, ids);
    listing.correct(correction(original(10, 110), 1), {
      ...resolved,
      place: { ...resolved.place, id: 'corrected-place' },
    });
    listing.observe(original(13, 130), resolved, ids);
    const removed = listing.remove(date(12), id(200));
    expect(removed?.payload.listing).toMatchObject({
      askingPriceMinorUnits: 110,
      placeId: resolved.place.id,
      provenance: { observedAt: date(10), snapshotId: original(10).payload.snapshot.snapshotId },
    });
    expect(listing.state.canonicalSnapshotId).toBe(original(13).payload.snapshot.snapshotId);
    expect(listing.state.acquisitions.at(-1)?.original).toEqual(original(13, 130));
    expect(listing.state.lifeline).toEqual([{ from: date(1), to: date(12) }]);
  });
  it('advances no absence when a new identity has no original evidence at completion', () => {
    const initial = original(13);
    const listing = new ListingChronology(
      new Property(id(1000), id(1001), initial, resolved),
      null,
      hash,
    );
    const before = JSON.stringify(listing.state);
    expect(listing.remove(date(12), id(200))).toBeNull();
    expect(JSON.stringify(listing.state)).toBe(before);
    expect(listing.observe(original(14), resolved, ids)).toEqual([]);
    expect(listing.state.acquisitions).toHaveLength(2);
  });
  it('retains constituent closures so a late overlapping return preserves a genuine gap after restart', () => {
    const listing = chronology();
    listing.remove(date(4), id(200));
    listing.observe(original(6), resolved, ids);
    listing.remove(date(7), id(201));
    listing.observe(original(3), resolved, ids);
    expect(unionListingLifelines(listing.state.lifeline)).toEqual([{ from: date(1), to: null }]);
    const restarted = new ListingChronology(
      new Property(id(1000), id(1001), original(1), resolved),
      structuredClone(listing.state),
      hash,
    );
    restarted.remove(date(5), id(202));
    expect(restarted.state.lifeline).toEqual([
      { from: date(1), to: date(4) },
      { from: date(6), to: date(7) },
      { from: date(3), to: date(5) },
    ]);
    expect(unionListingLifelines(restarted.state.lifeline)).toEqual([
      { from: date(1), to: date(5) },
      { from: date(6), to: date(7) },
    ]);
    expect(restarted.state.history.map((entry) => entry.effectiveAt)).toEqual([
      date(1),
      date(4),
      date(6),
      date(7),
      date(3),
      date(5),
    ]);
    expect(restarted.state.revision).toBe(6);
    expect(restarted.state.acquisitions).toHaveLength(3);
    expect(
      unionListingLifelines([
        { from: date(7), to: date(6) },
        { from: date(3), to: date(3) },
      ]),
    ).toEqual([{ from: date(3), to: date(3) }]);
  });
  it('retains inverted observations while immutable changes follow the canonical original frontier', () => {
    const listing = chronology();
    listing.observe(original(13, 130, 'Thirteen.'), resolved, ids);
    const retained = JSON.stringify(listing.state.history);
    const inverted = listing.observe(original(12, 120, 'Twelve.'), resolved, ids);
    expect(inverted[0]!.payload).toMatchObject({
      previousMinorUnits: 130,
      effectiveAt: date(12),
      revision: 4,
    });
    expect(
      listing.state.acquisitions.map((item) => item.original.payload.source.observedAt),
    ).toEqual([date(1), date(12), date(13)]);
    expect(JSON.stringify(listing.state.history.slice(0, 3))).toBe(retained);
    expect(listing.state.canonicalSnapshotId).toBe(original(12).payload.snapshot.snapshotId);
    listing.correct(correction(original(12, 120, 'Twelve.'), 1), resolved);
    const restarted = new ListingChronology(
      new Property(id(1000), id(1001), original(1), resolved),
      structuredClone(listing.state),
      hash,
    );
    expect(
      restarted.observe(original(14, 140, 'Fourteen.'), resolved, ids)[0]!.payload,
    ).toMatchObject({ previousMinorUnits: 120, revision: 6 });
    expect(restarted.observe(original(12, 120, 'Twelve.'), resolved, ids)).toEqual([]);
  });
  it('emits ordinary changes when a new identity has a second canonical observation before creation', () => {
    const initial = original(13, 130, 'Thirteen.');
    const listing = new ListingChronology(
      new Property(id(1000), id(1001), initial, resolved),
      null,
      hash,
    );
    const changes = listing.observe(original(12, 120, 'Twelve.'), resolved, ids);
    expect(changes.map((event) => event.type)).toEqual([
      'properties.listing.price-changed',
      'properties.listing.description-changed',
    ]);
    expect(changes.map((event) => event.payload.revision)).toEqual([2, 3]);
    expect(listing.state.history[0]!.effectiveAt).toBe(date(13));
    expect(listing.state.lifeline).toEqual([{ from: date(12), to: null }]);
  });
  it('backfills valid older legacy evidence without changing the published event frontier', () => {
    const initial = original(3, 100, 'Immutable creation text.');
    const c = new ListingChronology(
      new Property(id(1000), id(1001), initial, resolved),
      null,
      hash,
    );
    const history = JSON.stringify(c.state.history);
    expect(c.backfill(original(2, 200), resolved)).toBe(true);
    expect(c.backfill(original(1, 300), resolved)).toBe(true);
    expect(c.backfill(original(1, 300), resolved)).toBe(false);
    expect(c.state.acquisitions.map((item) => item.original.payload.source.observedAt)).toEqual([
      date(1),
      date(2),
      date(3),
    ]);
    expect(c.state.lifeline).toEqual([{ from: date(1), to: null }]);
    expect(c.state.revision).toBe(1);
    expect(JSON.stringify(c.state.history)).toBe(history);
    c.correct(correction(original(1, 300), 1), resolved);
    expect(c.state.acquisitions.at(-1)?.original).toEqual(initial);
    expect(
      c
        .observe(original(4, 90, 'Immutable creation text.'), resolved, ids)
        .map((item) => item.type),
    ).toEqual(['properties.listing.price-changed']);
    expect(c.state.revision).toBe(2);
    expect(() => c.backfill(original(5), resolved)).toThrow('creation frontier');
  });
  it('counts unchanged and attribute-only acquisitions without creating market events', () => {
    const listing = chronology();
    expect(listing.observe(original(2), resolved, ids)).toEqual([]);
    expect(listing.observe(original(3, 100, undefined, 2), resolved, ids)).toEqual([]);
    expect(listing.state.acquisitions).toHaveLength(3);
    expect(listing.state.history.map((event) => event.type)).toEqual(['created']);
    expect(listing.state.revision).toBe(1);
    expect(listing.observe(original(3, 100, undefined, 2), resolved, ids)).toEqual([]);
    expect(listing.state.acquisitions).toHaveLength(3);
  });
  it('orders price before description with original previous values and consecutive revisions', () => {
    const listing = chronology();
    const emitted = listing.observe(original(2, 90, 'A new synthetic description.'), resolved, ids);
    expect(emitted.map((event) => event.type)).toEqual([
      'properties.listing.price-changed',
      'properties.listing.description-changed',
    ]);
    expect(emitted.map((event) => event.payload.revision)).toEqual([2, 3]);
    expect(emitted[0]!.payload).toMatchObject({
      previousMinorUnits: 100,
      effectiveAt: date(2),
      listing: { askingPriceMinorUnits: 90, provenance: { observedAt: date(2) } },
    });
    expect(emitted[1]!.payload).toMatchObject({
      beforeHash: hash('Original synthetic description.'),
      afterHash: hash('A new synthetic description.'),
    });
  });
  it('closes absence at completion once and reopens before value changes under the same IDs', () => {
    const listing = chronology();
    const removal = listing.remove(date(3), id(200));
    expect(removal?.payload).toMatchObject({
      revision: 2,
      effectiveAt: date(3),
      listing: { status: 'removed', provenance: { observedAt: date(1) } },
    });
    expect(listing.remove(date(4), id(201))).toBeNull();
    const returned = listing.observe(original(5, 80, 'Return description.'), resolved, ids);
    expect(returned.map((event) => event.type)).toEqual([
      'properties.listing.reappeared',
      'properties.listing.price-changed',
      'properties.listing.description-changed',
    ]);
    expect(returned.map((event) => event.payload.revision)).toEqual([3, 4, 5]);
    expect(returned.every((event) => event.aggregateId === id(1001))).toBe(true);
    expect(listing.state.lifeline).toEqual([
      { from: date(1), to: date(3) },
      { from: date(5), to: null },
    ]);
  });
  it('unions an overlapping return while preserving authentic dates and revisions across restart', () => {
    const listing = chronology();
    const removed = listing.remove(date(4), id(200));
    const returned = listing.observe(original(3), resolved, ids);
    expect(removed?.payload.effectiveAt).toBe(date(4));
    expect(returned[0]?.payload.effectiveAt).toBe(date(3));
    expect(returned[0]?.payload.revision).toBe(3);
    expect(listing.state.lifeline).toEqual([
      { from: date(1), to: date(4) },
      { from: date(3), to: null },
    ]);
    expect(unionListingLifelines(listing.state.lifeline)).toEqual([{ from: date(1), to: null }]);
    const state = JSON.parse(JSON.stringify(listing.state));
    const restarted = new ListingChronology(
      new Property(id(1000), id(1001), original(1), resolved),
      state,
      hash,
    );
    expect(restarted.observe(original(5), resolved, ids)).toEqual([]);
    expect(restarted.state.lifeline).toEqual(state.lifeline);
    expect(unionListingLifelines(restarted.state.lifeline)).toEqual([{ from: date(1), to: null }]);
    expect(restarted.state.history).toEqual(state.history);
    const earlierCompletion = new ListingChronology(
      new Property(id(1000), id(1001), original(1), resolved),
      state,
      hash,
    );
    expect(earlierCompletion.remove(date(3), id(201))?.payload.effectiveAt).toBe(date(3));
    expect(earlierCompletion.state.lifeline).toEqual([
      { from: date(1), to: date(4) },
      { from: date(3), to: date(3) },
    ]);
    expect(unionListingLifelines(earlierCompletion.state.lifeline)).toEqual([
      { from: date(1), to: date(4) },
    ]);
    expect(earlierCompletion.state.history.at(-1)?.effectiveAt).toBe(date(3));
  });
  it('retains original fact/event bytes and counts when corrected, with highest order winning', () => {
    const listing = chronology();
    const second = original(2, 90);
    const events = listing.observe(second, resolved, ids);
    const bytes = JSON.stringify({
      events,
      originals: listing.state.acquisitions.map((item) => item.original),
    });
    expect(listing.correct(correction(second, 2, 95), resolved)).toBe(true);
    expect(listing.correct(correction(second, 1, 96), resolved)).toBe(false);
    expect(listing.correct(correction(second, 2, 95), resolved)).toBe(false);
    expect(listing.state.revision).toBe(2);
    expect(listing.state.acquisitions).toHaveLength(2);
    const value = new NormalizedListing(listing.state.acquisitions[1]!.corrected);
    expect(value.askingPriceMinorUnits.value).toBe(95);
    expect(value.provenance).toEqual(new NormalizedListing(second).provenance);
    expect(
      JSON.stringify({
        events,
        originals: listing.state.acquisitions.map((item) => item.original),
      }),
    ).toBe(bytes);
    expect(listing.observe(original(3, 90), resolved, ids)).toEqual([]);
  });
  it('does not replace a newer current acquisition for a historical correction and waits for originals', () => {
    const listing = chronology();
    const later = original(2, 90);
    expect(listing.correct(correction(later, 1), resolved)).toBe(false);
    listing.observe(later, resolved, ids);
    listing.correct(correction(original(1), 1), resolved);
    expect(listing.state.acquisitions.at(-1)!.original).toEqual(later);
    expect(listing.state.acquisitions[0]!.corrected?.payload.listing.askingPriceMinorUnits).toBe(
      999,
    );
    const restarted = new ListingChronology(
      new Property(id(1000), id(1001), original(1), resolved),
      JSON.parse(JSON.stringify(listing.state)),
      hash,
    );
    expect(restarted.observe(later, resolved, ids)).toEqual([]);
    expect(restarted.state).toEqual(JSON.parse(JSON.stringify(listing.state)));
  });
  it('compares persisted JSONB provenance by value regardless of object key order', () => {
    const listing = chronology();
    const persisted = JSON.parse(JSON.stringify(listing.state));
    const source = persisted.acquisitions[0].original.payload.source;
    persisted.acquisitions[0].original.payload.source = {
      observedAt: source.observedAt,
      sourceUrl: source.sourceUrl,
      sourceListingId: source.sourceListingId,
      sourceId: source.sourceId,
    };
    const restarted = new ListingChronology(
      new Property(id(1000), id(1001), original(1), resolved),
      persisted,
      hash,
    );
    expect(restarted.correct(correction(original(1), 1), resolved)).toBe(true);
  });
  it('accepts valid inverted originals but rejects alien provenance, invalid timestamps and missing effect IDs', () => {
    const listing = chronology();
    listing.observe(original(3, 90), resolved, ids);
    expect(listing.observe(original(2), resolved, ids)[0]!.payload).toMatchObject({
      previousMinorUnits: 90,
      effectiveAt: date(2),
    });
    expect(listing.state.acquisitions).toHaveLength(3);
    expect(() =>
      listing.observe(
        new CollectionSnapshotParsed({
          ...original(4),
          payload: {
            ...original(4).payload,
            source: { ...original(4).payload.source, sourceListingId: 'ALIEN' },
          },
        }),
        resolved,
        ids,
      ),
    ).toThrow('identity');
    expect(() => listing.observe(original(4, 80), resolved, [])).toThrow('identity');
    expect(listing.remove(date(1), id(200))?.payload.listing.provenance.observedAt).toBe(date(1));
    expect(() =>
      listing.correct(
        new CollectionSnapshotCorrected({
          ...correction(original(3, 90), 1),
          payload: {
            ...correction(original(3, 90), 1).payload,
            source: { ...original(3).payload.source, sourceUrl: 'https://synthetic.invalid/alien' },
          },
        }),
        resolved,
      ),
    ).toThrow('provenance');
    expect(() => new NormalizedListing({ type: 'collection.run.completed' })).toThrow();
  });
});
