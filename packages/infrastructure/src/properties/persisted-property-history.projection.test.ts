import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  CollectionSnapshotCorrected,
  CollectionSnapshotParsed,
  ListingChronology,
} from '@rei/domain';
import { initialEvent, initialProperty, fixtureId } from './property.test-fixture.js';
import { projectInitialProperty } from './persisted-property.projection.js';

describe('persisted corrected history projections', () => {
  it('derives five days from durable constituents without erasing the genuine gap', async () => {
    const property = await initialProperty();
    const date = (day: number) =>
      new Date(
        Date.parse(initialEvent.payload.source.observedAt) + (day - 1) * 86400000,
      ).toISOString();
    const c = new ListingChronology(
      property,
      null,
      (text) => `sha256:${createHash('sha256').update(text).digest('hex')}`,
    );
    const make = (day: number) =>
      new CollectionSnapshotParsed({
        ...initialEvent,
        eventId: fixtureId(day + 100),
        aggregateId: fixtureId(day + 200),
        payload: {
          ...initialEvent.payload,
          snapshot: { ...initialEvent.payload.snapshot, snapshotId: fixtureId(day + 200) },
          source: { ...initialEvent.payload.source, observedAt: date(day) },
        },
      });
    c.remove(date(4), fixtureId(301));
    c.observe(make(6), property.resolved, [fixtureId(302)]);
    c.remove(date(7), fixtureId(303));
    c.observe(make(3), property.resolved, [fixtureId(304)]);
    const prior = projectInitialProperty(property, true, c.state);
    expect(prior.property.listings[0]?.lifeline).toEqual([{ from: date(1), to: null }]);
    const restarted = new ListingChronology(
      property,
      structuredClone(c.state),
      (text) => `sha256:${createHash('sha256').update(text).digest('hex')}`,
    );
    restarted.remove(date(5), fixtureId(305));
    const response = projectInitialProperty(property, true, restarted.state);
    expect(response.property.listings[0]?.lifeline).toEqual([
      { from: date(1), to: date(5) },
      { from: date(6), to: date(7) },
    ]);
    expect(response.property.summary.timeOnMarketDays).toBe(5);
    expect(response.metadata.asOf).toBe(date(7));
    expect(response.property.listings[0]?.collectionCount).toBe(3);
    expect(response.property.listings[0]?.status).toBe('removed');
    expect(response.property.listings[0]?.history.map((entry) => entry.effectiveAt)).toEqual([
      date(1),
      date(4),
      date(6),
      date(7),
      date(3),
      date(5),
    ]);
  });
  it('selects dated current values and geography independently from inverted canonical publication order', async () => {
    const property = await initialProperty();
    const c = new ListingChronology(
      property,
      null,
      (text) => `sha256:${createHash('sha256').update(text).digest('hex')}`,
    );
    const make = (day: number, price: number) =>
      new CollectionSnapshotParsed({
        ...initialEvent,
        eventId: fixtureId(day),
        aggregateId: fixtureId(day + 100),
        payload: {
          ...initialEvent.payload,
          snapshot: { ...initialEvent.payload.snapshot, snapshotId: fixtureId(day + 100) },
          source: { ...initialEvent.payload.source, observedAt: `2026-10-${day}T12:00:00.000Z` },
          listing: {
            ...initialEvent.payload.listing,
            askingPriceMinorUnits: price,
            maskedDescription: `Observed on ${day}.`,
          },
        },
      });
    const newest = make(13, 13000000);
    const older = make(12, 12000000);
    c.observe(newest, property.resolved, [fixtureId(201), fixtureId(202)]);
    c.observe(
      older,
      { ...property.resolved, place: { ...property.resolved.place, id: 'older-geography' } },
      [fixtureId(203), fixtureId(204)],
    );
    const response = projectInitialProperty(property, true, c.state);
    const listing = response.property.listings[0]!;
    expect(listing.collectionCount).toBe(3);
    expect(listing.askingPriceMinorUnits).toBe(13000000);
    expect(listing.provenance.snapshotId).toBe(newest.payload.snapshot.snapshotId);
    expect(listing.place.id).toBe(property.resolved.place.id);
    expect(listing.lastCollectedAt).toBe(newest.payload.source.observedAt);
    expect(response.metadata.asOf).toBe(newest.payload.source.observedAt);
    expect(listing.description).toMatchObject({
      current: 'Observed on 13.',
      versions: [
        { text: initialEvent.payload.listing.maskedDescription },
        { text: 'Observed on 12.' },
        { text: 'Observed on 13.' },
      ],
    });
  });
  it('counts overlapping active exposure once and takes freshness from every retained effective date', async () => {
    const property = await initialProperty();
    const chronology = new ListingChronology(
      property,
      null,
      (text) => `sha256:${createHash('sha256').update(text).digest('hex')}`,
    );
    const later = new CollectionSnapshotParsed({
      ...initialEvent,
      eventId: fixtureId(30),
      aggregateId: fixtureId(31),
      payload: {
        ...initialEvent.payload,
        snapshot: { ...initialEvent.payload.snapshot, snapshotId: fixtureId(31) },
        source: { ...initialEvent.payload.source, observedAt: '2026-10-12T12:00:00.000Z' },
      },
    });
    chronology.remove('2026-10-14T12:00:00.000Z', fixtureId(40));
    chronology.observe(later, property.resolved, [fixtureId(41)]);
    const before = projectInitialProperty(property, true, chronology.state);
    expect(before.metadata.asOf).toBe('2026-10-14T12:00:00.000Z');
    expect(before.property.summary.timeOnMarketDays).toBe(4);
    expect(before.property.listings[0]?.lifeline).toEqual([
      { from: initialEvent.payload.source.observedAt, to: null },
    ]);
    chronology.observe(
      new CollectionSnapshotParsed({
        ...later,
        eventId: fixtureId(50),
        aggregateId: fixtureId(51),
        payload: {
          ...later.payload,
          snapshot: { ...later.payload.snapshot, snapshotId: fixtureId(51) },
          source: { ...later.payload.source, observedAt: '2026-10-16T12:00:00.000Z' },
        },
      }),
      property.resolved,
      [],
    );
    expect(
      projectInitialProperty(property, true, chronology.state).property.summary.timeOnMarketDays,
    ).toBe(6);
  });
  it('projects older legacy evidence, corrections and denied text without replacing newer current values', async () => {
    const property = await initialProperty();
    const c = new ListingChronology(
      property,
      null,
      (text) => `sha256:${createHash('sha256').update(text).digest('hex')}`,
    );
    const older = new CollectionSnapshotParsed({
      ...initialEvent,
      eventId: fixtureId(30),
      aggregateId: fixtureId(31),
      occurredAt: '2026-10-09T12:00:00.000Z',
      payload: {
        ...initialEvent.payload,
        snapshot: { ...initialEvent.payload.snapshot, snapshotId: fixtureId(31) },
        source: { ...initialEvent.payload.source, observedAt: '2026-10-09T12:00:00.000Z' },
        listing: {
          ...initialEvent.payload.listing,
          askingPriceMinorUnits: 90000000,
          maskedDescription: 'Owned backfilled text.',
        },
      },
    });
    c.backfill(older, property.resolved);
    c.correct(
      new CollectionSnapshotCorrected({
        ...older,
        eventId: fixtureId(50),
        occurredAt: '2026-10-13T12:00:00.000Z',
        payload: {
          ...older.payload,
          listing: {
            ...older.payload.listing,
            askingPriceMinorUnits: 95000000,
            maskedDescription: 'Owned corrected backfill.',
          },
          correction: {
            kind: 'parser-correction',
            operationKey: 'backfill-correction',
            parserRevision: 'v2',
            order: 1,
            originalParsedEventId: older.eventId,
          },
        },
      }),
      property.resolved,
    );
    const response = projectInitialProperty(property, true, c.state);
    const listing = response.property.listings[0]!;
    expect(listing.collectionCount).toBe(2);
    expect(listing.firstCollectedAt).toBe(older.payload.source.observedAt);
    expect(listing.askingPriceMinorUnits).toBe(initialEvent.payload.listing.askingPriceMinorUnits);
    expect(listing.provenance.snapshotId).toBe(initialEvent.payload.snapshot.snapshotId);
    expect(listing.lifeline[0]?.from).toBe(older.payload.source.observedAt);
    expect(listing.description).toMatchObject({
      versions: [
        { text: 'Owned corrected backfill.' },
        { text: initialEvent.payload.listing.maskedDescription },
      ],
    });
    expect(listing.history.map((item) => item.type)).toEqual(['created']);
    expect(response.property.priceChanges).toEqual([]);
    const denied = projectInitialProperty(property, false, c.state);
    expect(JSON.stringify(denied)).not.toContain('Owned corrected backfill.');
    expect(denied.property.listings[0]?.description.permission).toBe('denied');
  });
  it('projects corrected dated attributes and description while retaining original history and provenance', async () => {
    const property = await initialProperty();
    const chronology = new ListingChronology(
      property,
      null,
      (text) => `sha256:${createHash('sha256').update(text).digest('hex')}`,
    );
    const later = new CollectionSnapshotParsed({
      ...initialEvent,
      eventId: fixtureId(30),
      aggregateId: fixtureId(31),
      occurredAt: '2026-10-12T12:00:00.000Z',
      payload: {
        ...initialEvent.payload,
        snapshot: {
          ...initialEvent.payload.snapshot,
          snapshotId: fixtureId(31) as typeof initialEvent.payload.snapshot.snapshotId,
        },
        source: { ...initialEvent.payload.source, observedAt: '2026-10-12T12:00:00.000Z' },
        listing: {
          ...initialEvent.payload.listing,
          askingPriceMinorUnits: 70000000,
          bedrooms: 3,
          maskedDescription: 'Owned later original text.',
        },
      },
    });
    const events = chronology.observe(later, property.resolved, [
      fixtureId(40),
      fixtureId(41),
      fixtureId(42),
    ]);
    const correction = new CollectionSnapshotCorrected({
      ...later,
      eventId: fixtureId(50),
      occurredAt: '2026-10-13T12:00:00.000Z',
      payload: {
        ...later.payload,
        listing: {
          ...later.payload.listing,
          askingPriceMinorUnits: 72000000,
          bedrooms: 4,
          maskedDescription: 'Owned corrected current text.',
        },
        correction: {
          kind: 'parser-correction',
          operationKey: 'owned-projection',
          parserRevision: 'projection-2',
          order: 2,
          originalParsedEventId: later.eventId,
        },
      },
    });
    chronology.correct(correction, property.resolved);
    const response = projectInitialProperty(property, true, chronology.state);
    const listing = response.property.listings[0]!;
    expect(listing.askingPriceMinorUnits).toBe(72000000);
    expect(listing.bedrooms).toBe(4);
    expect(listing.collectionCount).toBe(2);
    expect(listing.fieldEffectiveAt).toEqual({
      askingPrice: later.payload.source.observedAt,
      description: later.payload.source.observedAt,
      attributes: later.payload.source.observedAt,
    });
    expect(listing.provenance.snapshotId).toBe(later.payload.snapshot.snapshotId);
    expect(listing.history).toEqual(chronology.state.history);
    expect(response.property.priceChanges[0]?.currentMinorUnits).toBe(70000000);
    expect(response.property.priceChanges[0]?.changePercent).toBeLessThan(0);
    expect(events[0]?.payload.listing.askingPriceMinorUnits).toBe(70000000);
    expect(listing.description).toMatchObject({
      current: 'Owned corrected current text.',
      versions: [
        {},
        { effectiveAt: later.payload.source.observedAt, text: 'Owned corrected current text.' },
      ],
    });
    const denied = projectInitialProperty(property, false, chronology.state);
    expect(JSON.stringify(denied)).not.toContain('Owned corrected current text.');
    expect(denied.property.listings[0]?.description).toMatchObject({
      permission: 'denied',
      changedAt: [later.payload.source.observedAt],
    });
  });
  it('leaves removed active-price summaries empty and excludes the absent interval from market time', async () => {
    const property = await initialProperty();
    const chronology = new ListingChronology(
      property,
      null,
      (text) => `sha256:${createHash('sha256').update(text).digest('hex')}`,
    );
    chronology.remove('2026-10-12T11:59:59.000Z', fixtureId(60));
    const removed = projectInitialProperty(property, true, chronology.state);
    expect(removed.property.summary.askingPrice).toBeNull();
    expect(removed.property.summary.pricePerSquareMeter).toBeNull();
    expect(removed.property.summary.activeListingCount).toBe(0);
    expect(removed.property.summary.timeOnMarketDays).toBe(2);
    expect(removed.metadata.asOf).toBe('2026-10-12T11:59:59.000Z');
    const returned = new CollectionSnapshotParsed({
      ...initialEvent,
      eventId: fixtureId(70),
      aggregateId: fixtureId(71),
      occurredAt: '2026-10-20T11:59:59.000Z',
      payload: {
        ...initialEvent.payload,
        snapshot: {
          ...initialEvent.payload.snapshot,
          snapshotId: fixtureId(71) as typeof initialEvent.payload.snapshot.snapshotId,
        },
        source: { ...initialEvent.payload.source, observedAt: '2026-10-20T11:59:59.000Z' },
      },
    });
    chronology.observe(returned, property.resolved, [fixtureId(80), fixtureId(81), fixtureId(82)]);
    const response = projectInitialProperty(property, true, chronology.state);
    expect(response.property.summary.returnedToMarket).toBe(true);
    expect(response.property.summary.timeOnMarketDays).toBe(2);
    expect(response.property.sale.status).toBe('not-recorded');
  });
});
