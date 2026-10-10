import { describe, expect, it } from 'vitest';

import {
  SYNTHETIC_SAO_PAULO_LISTING_REFERENCES,
  SYNTHETIC_SAO_PAULO_MATCH_LABELS,
} from './index.js';

function listingKey(reference: { readonly sourceId: string; readonly sourceListingId: string }) {
  return `${reference.sourceId}\u0000${reference.sourceListingId}`;
}

describe('synthetic Sao Paulo match labels', () => {
  it('pins nine unique canonical listing references', () => {
    const keys = SYNTHETIC_SAO_PAULO_LISTING_REFERENCES.map(listingKey);

    expect(keys).toHaveLength(9);
    expect(new Set(keys).size).toBe(9);
    expect(keys).toEqual([...keys].sort());
    expect(Object.isFrozen(SYNTHETIC_SAO_PAULO_LISTING_REFERENCES)).toBe(true);
    expect(SYNTHETIC_SAO_PAULO_LISTING_REFERENCES.every(Object.isFrozen)).toBe(true);
  });

  it('labels every unordered pair exactly once in canonical order', () => {
    const known = new Set(SYNTHETIC_SAO_PAULO_LISTING_REFERENCES.map(listingKey));
    const pairKeys = SYNTHETIC_SAO_PAULO_MATCH_LABELS.map((label) => {
      const left = listingKey(label.left);
      const right = listingKey(label.right);
      expect(known.has(left)).toBe(true);
      expect(known.has(right)).toBe(true);
      expect(left < right).toBe(true);
      expect(label.sameProperty).toBe(label.left.propertyLabel === label.right.propertyLabel);
      return `${left}\u0001${right}`;
    });

    expect(pairKeys).toHaveLength((9 * 8) / 2);
    expect(new Set(pairKeys).size).toBe(pairKeys.length);
    expect(pairKeys).toEqual([...pairKeys].sort());
    expect(
      new Set(SYNTHETIC_SAO_PAULO_MATCH_LABELS.map(({ sameProperty }) => sameProperty)),
    ).toEqual(new Set([true, false]));
    expect(Object.isFrozen(SYNTHETIC_SAO_PAULO_MATCH_LABELS)).toBe(true);
    expect(SYNTHETIC_SAO_PAULO_MATCH_LABELS.every(Object.isFrozen)).toBe(true);
  });

  it('has exactly one three-listing property spanning all three fictional portals', () => {
    const groups = new Map<string, typeof SYNTHETIC_SAO_PAULO_LISTING_REFERENCES>();
    for (const reference of SYNTHETIC_SAO_PAULO_LISTING_REFERENCES) {
      const group = groups.get(reference.propertyLabel) ?? [];
      groups.set(reference.propertyLabel, [...group, reference]);
    }

    expect([...groups.values()].map(({ length }) => length).sort()).toEqual([1, 1, 2, 2, 3]);
    const threeListingGroups = [...groups.values()].filter(({ length }) => length === 3);
    expect(threeListingGroups).toHaveLength(1);
    expect(new Set(threeListingGroups[0]?.map(({ sourceId }) => sourceId))).toEqual(
      new Set(['synthetic-portal-aurora', 'synthetic-portal-brisa', 'synthetic-portal-cobalto']),
    );
  });
});
