import { describe, expect, it } from 'vitest';
import {
  PropertiesEventV2,
  parsePropertiesEventV2,
  type CausalListingState,
} from './properties.events-v2.js';
import {
  parsePropertiesEvent,
  type ListingFact,
  type MinimumAskingPriceFact,
  type PropertiesEventType,
} from './properties.events.js';

const id = (n: number) => `0199c8f2-2394-7000-8000-${String(n).padStart(12, '0')}`;
const at = '2026-10-10T12:00:00.000Z';
function uppercaseUuids(value: unknown): unknown {
  if (typeof value === 'string')
    return /^[0-9a-f-]{36}$/i.test(value) ? value.toUpperCase() : value;
  if (Array.isArray(value)) return value.map(uppercaseUuids);
  if (typeof value === 'object' && value !== null)
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, uppercaseUuids(item)]),
    );
  return value;
}
function fact(n: number, property = 100, status: 'active' | 'removed' = 'active'): ListingFact {
  return {
    listingId: id(n),
    propertyId: id(property),
    sourceId: 'synthetic',
    sourceListingId: String(n),
    placeId: 'block',
    propertyType: 'apartment',
    areaSquareMeters: 10,
    status,
    askingPriceMinorUnits: 10000,
    currency: 'BRL',
    effectiveAt: at,
    provenance: {
      sourceId: 'synthetic',
      sourceListingId: String(n),
      sourceUrl: `https://synthetic.invalid/${n}`,
      runId: id(800),
      snapshotId: id(801),
      contentHash: `sha256:${'a'.repeat(64)}`,
      observedAt: at,
    },
  };
}
function minimum(property: number, listings: readonly ListingFact[]): MinimumAskingPriceFact {
  const active = listings
    .filter((l) => l.propertyId === id(property) && l.status === 'active')
    .sort(
      (a, b) =>
        a.askingPriceMinorUnits - b.askingPriceMinorUnits || (a.listingId < b.listingId ? -1 : 1),
    );
  const selected = active[0];
  return {
    propertyId: id(property),
    placeId: selected?.placeId ?? 'block',
    areaSquareMeters: selected?.areaSquareMeters ?? null,
    minimumMinorUnits: selected?.askingPriceMinorUnits ?? null,
    currency: 'BRL',
    selectedListingId: selected?.listingId ?? null,
    provenance: selected?.provenance ?? null,
    activeListingIds: active.map((l) => l.listingId),
  };
}
function reassignment(
  type: 'properties.property.merged' | 'properties.property.split' = 'properties.property.merged',
) {
  const listings = type.endsWith('merged')
    ? [fact(1, 100), fact(2, 101, 'removed')]
    : [fact(1, 100), fact(2, 100, 'removed')];
  const from = type.endsWith('merged') ? [100, 101] : [100];
  const to = type.endsWith('merged') ? [100] : [100, 102];
  const assignments = listings.map((listing, i) => ({
    listingId: listing.listingId,
    fromPropertyId: listing.propertyId,
    toPropertyId: id(to[i % to.length]!),
    fromAssignmentRevision: 2,
    assignmentRevision: 3,
  }));
  const after = listings.map((listing, i) => ({
    ...listing,
    propertyId: assignments[i]!.toPropertyId,
  }));
  return new PropertiesEventV2(type, {
    eventId: id(900),
    aggregateId: id(100),
    occurredAt: at,
    payload: {
      revision: 1,
      effectiveAt: at,
      previous: from.map((p) => minimum(p, listings)),
      resulting: to.map((p) => minimum(p, after)),
      listingStates: listings.map((listing) => ({ listing, revision: 2, assignmentRevision: 2 })),
      assignments,
    },
  });
}
describe('Properties causal v2 contracts', () => {
  it.each([
    'properties.listing.created',
    'properties.listing.price-changed',
    'properties.listing.description-changed',
    'properties.listing.removed',
    'properties.listing.reappeared',
  ] as const)('preserves v1 validation and adds independent assignment counter: %s', (type) => {
    const listing = fact(1, 100, type.endsWith('removed') ? 'removed' : 'active');
    const extra = type.endsWith('price-changed')
      ? { previousMinorUnits: 20000 }
      : type.endsWith('description-changed')
        ? { beforeHash: `sha256:${'b'.repeat(64)}`, afterHash: `sha256:${'c'.repeat(64)}` }
        : {};
    const event = new PropertiesEventV2(type, {
      eventId: id(900),
      aggregateId: id(1),
      occurredAt: at,
      payload: { listing, revision: 1, assignmentRevision: 0, effectiveAt: at, ...extra },
    });
    expect(parsePropertiesEventV2({ ...event })).toEqual(event);
    expect(parsePropertiesEventV2(uppercaseUuids(event))).toEqual(event);
    expect(Object.isFrozen(event.payload)).toBe(true);
    expect(() => parsePropertiesEvent({ ...event })).toThrow();
    for (const assignmentRevision of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1])
      expect(() =>
        parsePropertiesEventV2({ ...event, payload: { ...event.payload, assignmentRevision } }),
      ).toThrow();
  });
  it.each(['properties.property.merged', 'properties.property.split'] as const)(
    'routes removed members and retained result identifiers: %s',
    (type) => {
      const event = reassignment(type);
      expect(parsePropertiesEventV2({ ...event })).toEqual(event);
      expect(parsePropertiesEventV2(uppercaseUuids(event))).toEqual(event);
      const detached = structuredClone(event);
      Reflect.set(
        detached.payload.listingStates[0]!.listing.provenance,
        'sourceUrl',
        'https://changed.invalid',
      );
      expect(event.payload.listingStates[0]!.listing.provenance.sourceUrl).toBe(
        'https://synthetic.invalid/1',
      );
    },
  );
  it('validates price snapshots from complete declared states and ignores historical previous minimum', () => {
    const listing = fact(1);
    const current = minimum(100, [listing]);
    const event = new PropertiesEventV2('properties.property.asking-price-changed', {
      eventId: id(900),
      aggregateId: id(100),
      occurredAt: at,
      payload: {
        revision: 1,
        effectiveAt: at,
        previous: { ...current, minimumMinorUnits: 20000 },
        current,
        listingStates: [{ listing, revision: 3, assignmentRevision: 4 }],
      },
    });
    expect(parsePropertiesEventV2({ ...event })).toEqual(event);
    expect(parsePropertiesEventV2(uppercaseUuids(event))).toEqual(event);
    for (const changed of [
      { ...current, placeId: 'other' },
      { ...current, areaSquareMeters: 20 },
      { ...current, minimumMinorUnits: 9999 },
      { ...current, selectedListingId: id(2), activeListingIds: [id(2)] },
      { ...current, provenance: { ...listing.provenance, sourceUrl: 'https://other.invalid' } },
    ])
      expect(() =>
        parsePropertiesEventV2({ ...event, payload: { ...event.payload, current: changed } }),
      ).toThrow();
    expect(() =>
      parsePropertiesEventV2({ ...event, payload: { ...event.payload, listingStates: [] } }),
    ).toThrow();
    expect(() =>
      parsePropertiesEventV2({
        ...event,
        payload: {
          ...event.payload,
          listingStates: [
            { listing: { ...listing, propertyId: id(101) }, revision: 1, assignmentRevision: 0 },
          ],
        },
      }),
    ).toThrow();
  });
  it('rejects malformed metadata, cardinality, conservation, ties and all-member routing', () => {
    const event = reassignment();
    const p = event.payload;
    const changes: readonly unknown[] = [
      { ...p, private: true },
      { ...p, revision: 0 },
      { ...p, effectiveAt: '2027-01-01T00:00:00.000Z' },
      { ...p, listingStates: null },
      { ...p, listingStates: [...p.listingStates, p.listingStates[0]] },
      { ...p, listingStates: [{ ...p.listingStates[0], revision: 0 }, p.listingStates[1]] },
      { ...p, assignments: [] },
      { ...p, assignments: [p.assignments[0], p.assignments[0]] },
      { ...p, assignments: p.assignments.map((a) => ({ ...a, assignmentRevision: 9 })) },
      { ...p, assignments: p.assignments.map((a) => ({ ...a, fromPropertyId: id(999) })) },
      { ...p, assignments: p.assignments.map((a) => ({ ...a, toPropertyId: id(999) })) },
      {
        ...p,
        assignments: p.assignments.map((a) => ({
          ...a,
          fromAssignmentRevision: 0,
          assignmentRevision: 1,
        })),
      },
      { ...p, previous: [p.previous[0]] },
      { ...p, resulting: [...p.resulting, p.resulting[0]] },
      { ...p, listingStates: [] },
      {
        ...p,
        listingStates: [
          {
            ...p.listingStates[0],
            listing: { ...p.listingStates[0]!.listing, effectiveAt: '2027-01-01T00:00:00.000Z' },
          },
          p.listingStates[1],
        ],
      },
    ];
    for (const payload of changes)
      expect(() => parsePropertiesEventV2({ ...event, payload })).toThrow();
    const listings = [fact(1, 100), fact(2, 101)];
    const after = listings.map((l) => ({ ...l, propertyId: id(100) }));
    const tied = {
      ...p,
      listingStates: listings.map((listing) => ({ listing, revision: 2, assignmentRevision: 2 })),
      previous: [minimum(100, listings), minimum(101, listings)],
      resulting: [minimum(100, after)],
    };
    expect(() => parsePropertiesEventV2({ ...event, payload: tied })).not.toThrow();
    expect(() =>
      parsePropertiesEventV2({
        ...event,
        payload: {
          ...tied,
          resulting: [
            { ...tied.resulting[0], selectedListingId: id(2), provenance: listings[1]!.provenance },
          ],
        },
      }),
    ).toThrow();
    for (const raw of [
      null,
      [],
      { ...event, version: 1 },
      { ...event, type: 'properties.property.unknown' },
      { ...event, extra: true },
      { ...event, traceContext: { traceparent: 1 } },
      { ...event, traceContext: { traceparent: 'invalid' } },
      { ...event, eventId: 1 },
    ])
      expect(() => parsePropertiesEventV2(raw)).toThrow();
    expect(
      () =>
        new PropertiesEventV2('bad' as PropertiesEventType, {
          eventId: id(900),
          aggregateId: id(100),
          occurredAt: at,
          payload: p,
        }),
    ).toThrow();
  });
  it('accepts nullable minima when all members are removed', () => {
    const listing = fact(1, 100, 'removed');
    const current = minimum(100, [listing]);
    const states: readonly CausalListingState[] = [{ listing, revision: 5, assignmentRevision: 0 }];
    const event = new PropertiesEventV2('properties.property.asking-price-changed', {
      eventId: id(900),
      aggregateId: id(100),
      occurredAt: at,
      payload: {
        revision: 1,
        effectiveAt: at,
        previous: minimum(100, [fact(1)]),
        current,
        listingStates: states,
      },
    });
    expect(parsePropertiesEventV2({ ...event })).toEqual(event);
  });
});
