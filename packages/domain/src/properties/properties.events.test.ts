import { describe, expect, it } from 'vitest';
import {
  parsePropertiesEvent,
  PropertiesEvent,
  PROPERTIES_EVENT_TYPES,
  type ListingFact,
  type MinimumAskingPriceFact,
  type PropertiesPayloadMap,
} from './properties.events.js';

const id = (number: number) => `0199a3e0-0000-7000-8000-${number.toString().padStart(12, '0')}`;
const date = '2026-10-01T12:00:00.000Z';
const provenance = {
  sourceId: 'synthetic-data',
  sourceListingId: 'fixture-1',
  sourceUrl: 'https://fixture.invalid/one',
  runId: id(90),
  snapshotId: id(91),
  contentHash: `sha256:${'a'.repeat(64)}`,
  observedAt: date,
};
const listing: ListingFact = {
  listingId: id(101),
  propertyId: id(1),
  sourceId: 'synthetic-data',
  sourceListingId: 'fixture-1',
  placeId: 'sao-paulo-bela-vista',
  propertyType: 'apartment',
  areaSquareMeters: 82,
  status: 'active',
  askingPriceMinorUnits: 78000000,
  currency: 'BRL',
  effectiveAt: date,
  provenance,
};
const minimum = (
  propertyId: string,
  listingIds: readonly string[],
  price: number | null = 78000000,
): MinimumAskingPriceFact => ({
  propertyId,
  placeId: 'sao-paulo-bela-vista',
  areaSquareMeters: 82,
  minimumMinorUnits: price,
  currency: 'BRL',
  selectedListingId: listingIds[0] ?? null,
  provenance: listingIds.length ? provenance : null,
  activeListingIds: listingIds,
});
const payloads: PropertiesPayloadMap = {
  'properties.listing.created': { revision: 1, effectiveAt: date, listing },
  'properties.listing.price-changed': {
    revision: 2,
    effectiveAt: date,
    listing,
    previousMinorUnits: 80000000,
  },
  'properties.listing.description-changed': {
    revision: 3,
    effectiveAt: date,
    listing,
    beforeHash: `sha256:${'b'.repeat(64)}`,
    afterHash: provenance.contentHash,
  },
  'properties.listing.removed': {
    revision: 4,
    effectiveAt: date,
    listing: { ...listing, status: 'removed' },
  },
  'properties.listing.reappeared': { revision: 5, effectiveAt: date, listing },
  'properties.property.asking-price-changed': {
    revision: 6,
    effectiveAt: date,
    previous: minimum(id(1), [id(101)], 80000000),
    current: minimum(id(1), [id(101)]),
  },
  'properties.property.merged': {
    revision: 7,
    effectiveAt: date,
    previous: [minimum(id(2), [id(101)]), minimum(id(3), [id(102)])],
    resulting: [minimum(id(1), [id(101), id(102)])],
    listingFacts: [
      { ...listing, propertyId: id(2) },
      { ...listing, listingId: id(102), propertyId: id(3) },
    ],
    assignments: [
      { listingId: id(101), fromPropertyId: id(2), toPropertyId: id(1) },
      { listingId: id(102), fromPropertyId: id(3), toPropertyId: id(1) },
    ],
  },
  'properties.property.split': {
    revision: 8,
    effectiveAt: date,
    previous: [minimum(id(3), [id(101), id(102)])],
    resulting: [minimum(id(1), [id(101)]), minimum(id(2), [id(102)])],
    listingFacts: [
      { ...listing, propertyId: id(3) },
      { ...listing, listingId: id(102), propertyId: id(3) },
    ],
    assignments: [
      { listingId: id(101), fromPropertyId: id(3), toPropertyId: id(1) },
      { listingId: id(102), fromPropertyId: id(3), toPropertyId: id(2) },
    ],
  },
};
const fixtures = PROPERTIES_EVENT_TYPES.map(
  (type, index) =>
    new PropertiesEvent(type, {
      eventId: id(index + 20),
      aggregateId: type.startsWith('properties.listing') ? listing.listingId : id(1),
      occurredAt: date,
      payload: payloads[type],
    }),
);
function mutate(value: unknown, path: (string | number)[], replacement: unknown): unknown {
  const copy = structuredClone(value);
  if (!path.length) return replacement;
  let parent = copy as Record<string | number, unknown>;
  for (const key of path.slice(0, -1)) parent = parent[key] as Record<string | number, unknown>;
  parent[path.at(-1)!] = replacement;
  return copy;
}
describe('properties version-1 domain event boundary', () => {
  it('allows removed facts to reference the last snapshot, but rejects future minimum provenance', () => {
    const removed = JSON.parse(JSON.stringify(fixtures[3]));
    const older = '2026-09-01T12:00:00.000Z';
    removed.payload.listing.provenance.observedAt = older;
    expect(parsePropertiesEvent(removed).payload).toEqual(removed.payload);
    const created = JSON.parse(JSON.stringify(fixtures[0]));
    created.payload.listing.provenance.observedAt = older;
    expect(() => parsePropertiesEvent(created)).toThrow();
    const future = '2026-11-01T12:00:00.000Z';
    removed.payload.listing.provenance.observedAt = future;
    expect(() => parsePropertiesEvent(removed)).toThrow();
    for (const index of [5, 6, 7]) {
      const wire = JSON.parse(JSON.stringify(fixtures[index]));
      const facts =
        index === 5
          ? [wire.payload.previous, wire.payload.current]
          : [...wire.payload.previous, ...wire.payload.resulting];
      for (const fact of facts) {
        const saved = fact.provenance.observedAt;
        fact.provenance.observedAt = future;
        expect(() => parsePropertiesEvent(wire)).toThrow();
        fact.provenance.observedAt = saved;
      }
    }
  });
  it.each(fixtures)(
    'round trips immutable $type with dated assignments and provenance',
    (event) => {
      const parsed = parsePropertiesEvent(JSON.parse(JSON.stringify(event)));
      expect(parsed).toEqual(event);
      expect(Object.isFrozen(parsed)).toBe(true);
      expect(Object.isFrozen(parsed.payload)).toBe(true);
      expect(JSON.stringify(parsed)).not.toMatch(
        /description"|maskedDescription|contact|photo|fingerprint/,
      );
    },
  );
  it('fails every missing/extra object field and wrong scalar type recursively', () => {
    for (const fixture of fixtures) {
      const wire: unknown = JSON.parse(JSON.stringify(fixture));
      function audit(value: unknown, path: (string | number)[] = []): void {
        if (Array.isArray(value)) {
          value.forEach((child, index) => audit(child, [...path, index]));
          return;
        }
        if (typeof value === 'object' && value !== null) {
          const object = value as Record<string, unknown>;
          for (const key of Object.keys(object)) {
            const missing = { ...object };
            delete missing[key];
            expect(() => parsePropertiesEvent(mutate(wire, path, missing))).toThrow();
          }
          expect(() =>
            parsePropertiesEvent(mutate(wire, path, { ...object, leak: 'forbidden' })),
          ).toThrow();
          for (const [key, child] of Object.entries(object)) audit(child, [...path, key]);
        } else if (value !== null)
          expect(() =>
            parsePropertiesEvent(mutate(wire, path, typeof value === 'string' ? 9 : 'invalid')),
          ).toThrow();
      }
      audit(wire);
    }
  });
  it('rejects bad envelope identifiers, UTC dates, type, version and traces', () => {
    const wire = JSON.parse(JSON.stringify(fixtures[0]));
    for (const patch of [
      { eventId: 'bad' },
      { aggregateId: id(999) },
      { occurredAt: '2026-02-30T12:00:00.000Z' },
      { occurredAt: '2026-10-01T09:00:00-03:00' },
      { type: 'unknown' },
      { version: 2 },
      { traceContext: {} },
      { traceContext: { traceparent: 'bad' } },
      {
        traceContext: {
          traceparent: '00-1234567890abcdef1234567890abcdef-1234567890abcdef-01',
          extra: true,
        },
      },
    ])
      expect(() => parsePropertiesEvent({ ...wire, ...patch })).toThrow();
    expect(
      parsePropertiesEvent({
        ...wire,
        traceContext: {
          traceparent: '00-1234567890abcdef1234567890abcdef-1234567890abcdef-01',
          tracestate: 'fixture=one',
        },
      }).traceContext?.tracestate,
    ).toBe('fixture=one');
    expect(
      parsePropertiesEvent({
        ...wire,
        traceContext: { traceparent: '00-1234567890abcdef1234567890abcdef-1234567890abcdef-01' },
      }).traceContext,
    ).toBeDefined();
  });
  it('rejects numeric, identity, status, date and provenance contradictions', () => {
    const wire = JSON.parse(JSON.stringify(fixtures[1]));
    for (const revision of [0, -1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1])
      expect(() =>
        parsePropertiesEvent({ ...wire, payload: { ...wire.payload, revision } }),
      ).toThrow();
    for (const patch of [
      { listingId: id(555) },
      { status: 'removed' },
      { sourceId: 'UPPER' },
      { sourceId: 'another-source' },
      { sourceListingId: 'another' },
      { placeId: 'BAD' },
      { propertyType: 'boat' },
      { areaSquareMeters: 0 },
      { areaSquareMeters: Infinity },
      { currency: 'USD' },
      { askingPriceMinorUnits: 0 },
      { askingPriceMinorUnits: 1.5 },
      { effectiveAt: '2026-09-01T12:00:00.000Z' },
      { provenance: { ...provenance, sourceUrl: 'file:///bad' } },
      { provenance: { ...provenance, sourceUrl: 'https://user:secret@fixture.invalid' } },
      { provenance: { ...provenance, sourceUrl: 'bad' } },
      { provenance: { ...provenance, contentHash: 'bad' } },
    ])
      expect(() =>
        parsePropertiesEvent({
          ...wire,
          payload: { ...wire.payload, listing: { ...wire.payload.listing, ...patch } },
        }),
      ).toThrow();
    expect(() =>
      parsePropertiesEvent({
        ...wire,
        payload: { ...wire.payload, previousMinorUnits: listing.askingPriceMinorUnits },
      }),
    ).toThrow();
    expect(() =>
      parsePropertiesEvent({
        ...wire,
        payload: { ...wire.payload, effectiveAt: '2026-11-01T12:00:00.000Z' },
      }),
    ).toThrow();
    const description = JSON.parse(JSON.stringify(fixtures[2]));
    expect(() =>
      parsePropertiesEvent({
        ...description,
        payload: { ...description.payload, afterHash: description.payload.beforeHash },
      }),
    ).toThrow();
    const nullable = {
      ...wire,
      payload: { ...wire.payload, listing: { ...listing, areaSquareMeters: null } },
    };
    expect(parsePropertiesEvent(nullable)).toBeDefined();
  });
  it('supports no-active-listing minimum and rejects inconsistent selections', () => {
    const wire = JSON.parse(JSON.stringify(fixtures[5]));
    expect(
      parsePropertiesEvent({
        ...wire,
        payload: { ...wire.payload, current: minimum(id(1), [], null) },
      }),
    ).toBeDefined();
    for (const patch of [
      { propertyId: id(3) },
      { minimumMinorUnits: null },
      { selectedListingId: null },
      { provenance: null },
      { selectedListingId: id(999) },
      { activeListingIds: [id(101), id(101)] },
      { activeListingIds: [] },
      { currency: 'USD' },
    ])
      expect(() =>
        parsePropertiesEvent({
          ...wire,
          payload: { ...wire.payload, current: { ...wire.payload.current, ...patch } },
        }),
      ).toThrow();
    expect(() =>
      parsePropertiesEvent({
        ...wire,
        payload: { ...wire.payload, previous: wire.payload.current },
      }),
    ).toThrow();
  });
  it('rejects missing, ambiguous, duplicate and contradictory merge/split assignments', () => {
    for (const fixture of fixtures.slice(6)) {
      const wire = JSON.parse(JSON.stringify(fixture));
      for (const patch of [
        { assignments: [] },
        { listingFacts: [] },
        { listingFacts: [wire.payload.listingFacts[0]] },
        { listingFacts: [...wire.payload.listingFacts, wire.payload.listingFacts[0]] },
        { assignments: [wire.payload.assignments[0]] },
        { assignments: [...wire.payload.assignments, wire.payload.assignments[0]] },
        {
          assignments: [
            { ...wire.payload.assignments[0], fromPropertyId: id(999) },
            wire.payload.assignments[1],
          ],
        },
        {
          assignments: [
            { ...wire.payload.assignments[0], toPropertyId: id(999) },
            wire.payload.assignments[1],
          ],
        },
        { previous: [] },
        { resulting: [] },
        { previous: [...wire.payload.previous, wire.payload.previous[0]] },
        { resulting: [...wire.payload.resulting, wire.payload.resulting[0]] },
      ])
        expect(() =>
          parsePropertiesEvent({ ...wire, payload: { ...wire.payload, ...patch } }),
        ).toThrow();
    }
    expect(() => parsePropertiesEvent(null)).toThrow();
    expect(() => parsePropertiesEvent([])).toThrow();
  });
  it.each(['merged', 'split'] as const)(
    'accepts retained property IDs and past dated facts for %s',
    (action) => {
      const wire = JSON.parse(JSON.stringify(fixtures[action === 'merged' ? 6 : 7]));
      const retained = action === 'merged' ? id(2) : id(3);
      wire.aggregateId = retained;
      wire.payload.resulting[0].propertyId = retained;
      wire.payload.assignments[0].toPropertyId = retained;
      if (action === 'merged') wire.payload.assignments[1].toPropertyId = retained;
      const past = '2026-09-01T12:00:00.000Z';
      for (const fact of wire.payload.listingFacts) {
        fact.effectiveAt = past;
        fact.provenance.observedAt = past;
      }
      for (const minimum of [...wire.payload.previous, ...wire.payload.resulting])
        minimum.provenance.observedAt = past;
      expect(parsePropertiesEvent(wire).payload).toEqual(wire.payload);
      expect(wire.payload.assignments[0].fromPropertyId).toBe(
        wire.payload.assignments[0].toPropertyId,
      );
    },
  );
  it('permits a merge with an empty previous active set without fabricating a minimum', () => {
    const wire = JSON.parse(JSON.stringify(fixtures[6]));
    wire.payload.previous[1] = minimum(id(3), [], null);
    wire.payload.resulting[0] = minimum(id(1), [id(101)]);
    wire.payload.listingFacts = [wire.payload.listingFacts[0]];
    wire.payload.assignments = [wire.payload.assignments[0]];
    expect(parsePropertiesEvent(wire).payload).toEqual(wire.payload);
  });
  it.each(['merged', 'split'] as const)(
    'derives both minima from conserved listing prices for %s',
    (action) => {
      const wire = JSON.parse(JSON.stringify(fixtures[action === 'merged' ? 6 : 7]));
      const [expensive, cheap] = wire.payload.listingFacts;
      expensive.askingPriceMinorUnits = 80000000;
      cheap.askingPriceMinorUnits = 78000000;
      cheap.sourceListingId = 'fixture-2';
      cheap.provenance.sourceListingId = cheap.sourceListingId;
      for (const fact of [...wire.payload.previous, ...wire.payload.resulting]) {
        const selected = fact.activeListingIds.includes(cheap.listingId) ? cheap : expensive;
        fact.selectedListingId = selected.listingId;
        fact.minimumMinorUnits = selected.askingPriceMinorUnits;
        fact.provenance = structuredClone(selected.provenance);
      }
      expect(parsePropertiesEvent(wire).payload).toEqual(wire.payload);
      for (const side of ['previous', 'resulting'] as const) {
        for (let index = 0; index < wire.payload[side].length; index++) {
          const impossible = structuredClone(wire);
          impossible.payload[side][index].minimumMinorUnits = 79000000;
          expect(() => parsePropertiesEvent(impossible)).toThrow();
        }
        const grouped = wire.payload[side].findIndex(
          (fact: MinimumAskingPriceFact) => fact.activeListingIds.length === 2,
        );
        if (grouped >= 0) {
          for (const wrongPrice of [78000000, 80000000]) {
            const wrongSelection = structuredClone(wire);
            Object.assign(wrongSelection.payload[side][grouped], {
              selectedListingId: expensive.listingId,
              minimumMinorUnits: wrongPrice,
              provenance: expensive.provenance,
            });
            expect(() => parsePropertiesEvent(wrongSelection)).toThrow();
          }
        }
      }
      for (const patch of [
        { propertyId: id(999) },
        { status: 'removed' },
        { askingPriceMinorUnits: 79000000 },
        {
          effectiveAt: '2026-11-01T12:00:00.000Z',
          provenance: { ...expensive.provenance, observedAt: '2026-11-01T12:00:00.000Z' },
        },
      ]) {
        const invalid = structuredClone(wire);
        Object.assign(invalid.payload.listingFacts[0], patch);
        expect(() => parsePropertiesEvent(invalid)).toThrow();
      }
      const wrongProvenance = structuredClone(wire);
      wrongProvenance.payload.resulting[0].provenance.contentHash = `sha256:${'c'.repeat(64)}`;
      expect(() => parsePropertiesEvent(wrongProvenance)).toThrow();
      const extraAssignment = structuredClone(wire);
      extraAssignment.payload.assignments.push({
        ...wire.payload.assignments[0],
        listingId: id(999),
      });
      expect(() => parsePropertiesEvent(extraAssignment)).toThrow();
    },
  );
});
