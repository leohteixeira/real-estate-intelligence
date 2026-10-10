import { describe, expect, it } from 'vitest';
import type { PlaceDetail, PlaceRef } from './locations.read.types.js';
import { Place, selectUniqueBlock } from './place.entity.js';

const crumbs: PlaceRef[] = ['country', 'state', 'city', 'zone', 'neighborhood', 'street-block'].map(
  (kind, index) => ({
    id: `place-${index}`,
    kind: kind as PlaceRef['kind'],
    name: { en: 'Name', ptBR: 'Nome' },
  }),
);
const block: PlaceDetail = {
  ...crumbs[5]!,
  parentId: 'place-4',
  breadcrumbs: crumbs,
  adjacentPlaceIds: [],
  propertyCount: 0,
  coordinates: null,
  block: { streetName: 'Rua Um', fromNumber: 100, toNumber: 199, origin: 'prepared-fixture' },
};
describe('Place hierarchy and block invariants', () => {
  it('creates an immutable detached canonical place and inclusive integer range', () => {
    const place = new Place(block);
    expect(place.containsNumber(100)).toBe(true);
    expect(place.containsNumber(199)).toBe(true);
    expect(place.containsNumber(99)).toBe(false);
    expect(place.containsNumber(200)).toBe(false);
    expect(place.containsNumber(100.5)).toBe(false);
    expect(Object.isFrozen(place.detail.name)).toBe(true);
    expect(place.detail.breadcrumbs).not.toBe(crumbs);
    expect(
      new Place({
        ...crumbs[0]!,
        parentId: null,
        breadcrumbs: [crumbs[0]!],
        adjacentPlaceIds: [],
        propertyCount: 5,
        block: null,
        coordinates: null,
      }).containsNumber(100),
    ).toBe(false);
  });
  it.each([
    { ...block, parentId: null },
    { ...block, parentId: 'other' },
    { ...block, breadcrumbs: [...crumbs.slice(0, 4), crumbs[5]!] },
    { ...block, breadcrumbs: [...crumbs.slice(0, 5), { ...crumbs[5]!, id: 'other' }] },
    { ...block, block: null },
    { ...block, block: { ...block.block!, fromNumber: 200 } },
    { ...block, block: { ...block.block!, fromNumber: -1 } },
    { ...block, block: { ...block.block!, toNumber: 100.5 } },
    { ...block, propertyCount: -1 },
    { ...block, coordinates: { latitude: 91, longitude: 0 } },
    { ...block, adjacentPlaceIds: ['place-1'] },
  ])('rejects corrupt canonical hierarchy, ranges, coordinates and adjacency', (detail) =>
    expect(() => new Place(detail)).toThrow(),
  );
  it('resolves only one candidate, never the arbitrary first block', () => {
    const first = new Place(block);
    const second = new Place({
      ...block,
      id: 'place-other',
      breadcrumbs: [...crumbs.slice(0, 5), { ...crumbs[5]!, id: 'place-other' }],
      block: { ...block.block!, fromNumber: 200, toNumber: 299 },
    });
    expect(selectUniqueBlock([first])).toBe(first);
    expect(selectUniqueBlock([])).toBeNull();
    expect(selectUniqueBlock([first, second])).toBeNull();
    expect(selectUniqueBlock([first, second], 200)).toBe(second);
    expect(selectUniqueBlock([first, first], 100)).toBeNull();
    expect(selectUniqueBlock([first], 300)).toBeNull();
  });
});
