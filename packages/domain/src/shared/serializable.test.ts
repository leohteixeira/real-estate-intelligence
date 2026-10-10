import { describe, expect, it } from 'vitest';

import {
  immutableSerializableValue,
  isSerializableEventPayload,
  isSerializableValue,
} from './serializable.js';

describe('serializable values', () => {
  it('accepts and deeply clones finite JSON values', () => {
    const input = { values: [1, true, null, { label: 'stable' }] };
    const immutable = immutableSerializableValue(input);

    expect(isSerializableEventPayload(input)).toBe(true);
    expect(immutable).toEqual(input);
    expect(immutable).not.toBe(input);
    expect(immutable.values).not.toBe(input.values);
    expect(Object.isFrozen(immutable)).toBe(true);
    expect(Object.isFrozen(immutable.values)).toBe(true);
    expect(Object.isFrozen(immutable.values[3])).toBe(true);
  });

  it('rejects sparse arrays instead of silently serializing holes as null', () => {
    const sparse = new Array<unknown>(1);

    expect(isSerializableValue(sparse)).toBe(false);
    expect(isSerializableEventPayload({ sparse })).toBe(false);
  });

  it('rejects enumerable accessors without evaluating them', () => {
    let reads = 0;
    const input = {};
    Object.defineProperty(input, 'unstable', {
      enumerable: true,
      get: () => {
        reads += 1;
        return reads === 1 ? 'valid' : undefined;
      },
    });

    expect(isSerializableEventPayload(input)).toBe(false);
    expect(reads).toBe(0);
  });

  it('rejects array subclasses without invoking their polymorphic methods', () => {
    let mapCalls = 0;
    class PolymorphicArray extends Array<number> {}
    Object.defineProperty(PolymorphicArray.prototype, 'map', {
      value: () => {
        mapCalls += 1;
        return [undefined];
      },
    });
    const input = new PolymorphicArray();
    input.push(1);

    expect(isSerializableValue(input)).toBe(false);
    expect(mapCalls).toBe(0);
  });

  it('rejects arrays with symbols or enumerable extra properties', () => {
    const withExtraProperty = [1] as number[] & { extra?: boolean };
    withExtraProperty.extra = true;
    const withSymbol = [1];
    Object.defineProperty(withSymbol, Symbol('extra'), { value: true, enumerable: true });

    expect(isSerializableValue(withExtraProperty)).toBe(false);
    expect(isSerializableValue(withSymbol)).toBe(false);
  });

  it('clones indexed data without invoking an overridden map method', () => {
    let mapCalls = 0;
    const input = [1];
    Object.defineProperty(input, 'map', {
      value: () => {
        mapCalls += 1;
        return [undefined];
      },
    });

    expect(isSerializableValue(input)).toBe(true);
    expect(immutableSerializableValue(input)).toEqual([1]);
    expect(mapCalls).toBe(0);
  });

  it.each([
    Number.NaN,
    Number.POSITIVE_INFINITY,
    undefined,
    1n,
    new Date('2026-10-10T12:30:00Z'),
    new Map(),
  ])('rejects non-JSON value %s', (value) => {
    expect(isSerializableValue(value)).toBe(false);
  });

  it('rejects cycles while allowing repeated non-cyclic references', () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    const shared = { value: 1 };

    expect(isSerializableValue(cyclic)).toBe(false);
    expect(isSerializableValue([shared, shared])).toBe(true);
  });
});
