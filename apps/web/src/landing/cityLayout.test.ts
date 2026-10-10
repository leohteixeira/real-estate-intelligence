import { describe, expect, it } from 'vitest';

import {
  GRID_SIZE,
  MAX_HEIGHT,
  MAX_PRICE,
  MIN_HEIGHT,
  MIN_PRICE,
  SELECTED_PRICE,
  avenuePosition,
  axisPosition,
  buildCity,
  heightFor,
  zoneAt,
} from './cityLayout';

describe('buildCity', () => {
  const blocks = buildCity();

  it('lays out one block per grid cell', () => {
    expect(blocks).toHaveLength(GRID_SIZE * GRID_SIZE);
  });

  it('marks exactly one block as selected, in Zona Oeste, at the published price', () => {
    const selected = blocks.filter((block) => block.selected);

    expect(selected).toHaveLength(1);
    expect(selected[0]?.zone).toBe('oeste');
    expect(selected[0]?.price).toBe(SELECTED_PRICE);
  });

  it('keeps every price and height inside the declared range', () => {
    for (const block of blocks) {
      expect(block.price).toBeGreaterThanOrEqual(MIN_PRICE);
      expect(block.price).toBeLessThanOrEqual(MAX_PRICE);
      expect(block.height).toBeGreaterThanOrEqual(MIN_HEIGHT);
      expect(block.height).toBeLessThanOrEqual(MAX_HEIGHT);
    }
  });

  it('is deterministic', () => {
    expect(buildCity()).toEqual(blocks);
  });

  it('covers the five zones', () => {
    expect(new Set(blocks.map((block) => block.zone))).toEqual(
      new Set(['centro', 'oeste', 'sul', 'norte', 'leste']),
    );
  });
});

describe('heightFor', () => {
  it('grows with price and clamps outside the range', () => {
    expect(heightFor(MIN_PRICE)).toBe(MIN_HEIGHT);
    expect(heightFor(MAX_PRICE)).toBe(MAX_HEIGHT);
    expect(heightFor(9000)).toBeLessThan(heightFor(12000));
    expect(heightFor(MAX_PRICE * 2)).toBe(MAX_HEIGHT);
    expect(heightFor(0)).toBe(MIN_HEIGHT);
  });
});

describe('street grid', () => {
  it('is centred on the origin', () => {
    expect(axisPosition(0)).toBeCloseTo(-axisPosition(GRID_SIZE - 1));
  });

  it('widens the gap at an avenue', () => {
    const street = axisPosition(2) - axisPosition(1);
    const avenue = axisPosition(6) - axisPosition(5);

    expect(avenue).toBeGreaterThan(street);
    expect(avenuePosition(5)).toBeCloseTo((axisPosition(5) + axisPosition(6)) / 2);
  });

  it('puts the middle of the grid in the centre zone', () => {
    expect(zoneAt(10, 10)).toBe('centro');
    expect(zoneAt(0, 10)).toBe('oeste');
    expect(zoneAt(21, 10)).toBe('leste');
    expect(zoneAt(10, 0)).toBe('norte');
    expect(zoneAt(10, 21)).toBe('sul');
  });
});
