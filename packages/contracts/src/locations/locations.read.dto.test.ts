import { describe, expect, it } from 'vitest';
import { parsePlaceResponse, parsePlacesResponse } from './locations.read.dto.js';
const metadata = {
  dataMode: 'synthetic-stub',
  fixtureVersion: 'fixture-v1',
  asOf: '2026-10-01T12:00:00.000Z',
};
const place = {
  id: 'sao-paulo',
  kind: 'city',
  name: { en: 'São Paulo', ptBR: 'São Paulo' },
  parentId: null,
  breadcrumbs: [{ id: 'sao-paulo', kind: 'city', name: { en: 'São Paulo', ptBR: 'São Paulo' } }],
  adjacentPlaceIds: [],
  propertyCount: 5,
  coordinates: null,
  block: null,
};
describe('locations closed wire contracts', () => {
  it('admits all hierarchy kinds and strictly validates fictional block coordinates and metadata', () => {
    for (const kind of ['country', 'state', 'city', 'zone', 'neighborhood', 'street-block']) {
      expect(parsePlaceResponse({ metadata, place: { ...place, kind } }).place.kind).toBe(kind);
    }
    const block = {
      ...place,
      id: 'sao-paulo-bela-vista-fictional-block',
      kind: 'street-block',
      coordinates: { latitude: -23.55, longitude: -46.63 },
      block: {
        streetName: 'Fixture street',
        fromNumber: 100,
        toNumber: 199,
        origin: 'prepared-fixture',
      },
    };
    expect(
      parsePlaceResponse(JSON.parse(JSON.stringify({ metadata, place: block }))).place,
    ).toEqual(block);
    for (const patch of [
      { coordinates: { latitude: -91, longitude: 0 } },
      { coordinates: { latitude: 0, longitude: 181 } },
      { coordinates: { latitude: 0 } },
      { coordinates: { latitude: 0, longitude: 0, inferred: true } },
      { coordinates: { latitude: NaN, longitude: 0 } },
      { block: { ...block.block, fromNumber: -1 } },
      { block: { ...block.block, toNumber: 100.5 } },
      { block: { ...block.block, origin: 'geocoded' } },
      { block: { ...block.block, unit: 'private' } },
      ...Object.keys(block.block).map((key) => ({
        block: Object.fromEntries(Object.entries(block.block).filter(([field]) => field !== key)),
      })),
    ])
      expect(() => parsePlaceResponse({ metadata, place: { ...block, ...patch } })).toThrow();
  });
  it('round trips picker, empty children, parent, adjacency and bilingual crumbs', () => {
    const fixture = { metadata, place };
    expect(parsePlaceResponse(JSON.parse(JSON.stringify(fixture)))).toEqual(fixture);
    expect(parsePlacesResponse({ metadata, items: [place] }).items).toHaveLength(1);
    expect(parsePlacesResponse({ metadata, items: [] }).items).toEqual([]);
    expect(
      parsePlaceResponse({
        metadata,
        place: {
          ...place,
          id: 'bela-vista',
          kind: 'neighborhood',
          parentId: 'centro',
          adjacentPlaceIds: ['vila-mariana'],
        },
      }),
    ).toBeDefined();
  });
  it('rejects unrecognized or missing fields, identifiers and counts', () => {
    const fixture = { metadata, place };
    function audit(value: unknown, path: (string | number)[] = []): void {
      if (Array.isArray(value)) {
        value.forEach((child, index) => audit(child, [...path, index]));
        return;
      }
      if (typeof value !== 'object' || value === null) return;
      const object = value as Record<string, unknown>;
      const mutations = [
        { ...object, extra: true },
        ...Object.keys(object).map((key) => {
          const missing = { ...object };
          delete missing[key];
          return missing;
        }),
      ];
      for (const mutation of mutations) {
        const copy = structuredClone(fixture);
        if (!path.length) {
          expect(() => parsePlaceResponse(mutation)).toThrow();
          continue;
        }
        let parent = copy as unknown as Record<string | number, unknown>;
        for (const segment of path.slice(0, -1))
          parent = parent[segment] as Record<string | number, unknown>;
        parent[path.at(-1)!] = mutation;
        expect(() => parsePlaceResponse(copy)).toThrow();
      }
      for (const [key, child] of Object.entries(object)) audit(child, [...path, key]);
    }
    audit(fixture);
    for (const patch of [
      { propertyCount: -1 },
      { propertyCount: 1.1 },
      { id: 'BAD' },
      { kind: 'county' },
      { extra: true },
      { name: { en: 'One' } },
      { breadcrumbs: [{}] },
      { adjacentPlaceIds: ['BAD'] },
    ])
      expect(() => parsePlaceResponse({ metadata, place: { ...place, ...patch } })).toThrow();
    expect(() => parsePlacesResponse({ metadata, items: null })).toThrow();
  });
});
