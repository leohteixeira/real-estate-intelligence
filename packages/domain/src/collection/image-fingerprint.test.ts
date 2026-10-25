import { describe, expect, it } from 'vitest';
import { dhash64, fingerprintDistance, fingerprintSimilarity } from './image-fingerprint.js';

describe('D-089 horizontal dHash64', () => {
  it('uses row order, strict right-greater and most significant first', () => {
    expect(dhash64(new Uint8Array(72))).toBe('dhash64-v1:0000000000000000');
    expect(dhash64(Uint8Array.from({ length: 72 }, (_, i) => i % 9))).toBe(
      'dhash64-v1:ffffffffffffffff',
    );
    expect(dhash64(Uint8Array.from({ length: 72 }, (_, i) => 8 - (i % 9)))).toBe(
      'dhash64-v1:0000000000000000',
    );
    const first = new Uint8Array(72);
    first[1] = 1;
    expect(dhash64(first)).toBe('dhash64-v1:8000000000000000');
    const last = new Uint8Array(72);
    last[71] = 1;
    expect(dhash64(last)).toBe('dhash64-v1:0000000000000001');
    expect(() => dhash64(new Uint8Array(71))).toThrow();
  });
  it('defines distance 0–64 and similarity only within the matching tag', () => {
    const zero = 'dhash64-v1:0000000000000000';
    expect(fingerprintDistance(zero, zero)).toBe(0);
    expect(fingerprintDistance(zero, 'dhash64-v1:ffffffffffffffff')).toBe(64);
    expect(fingerprintSimilarity(zero, zero)).toBe(1);
    expect(fingerprintSimilarity(zero, 'dhash64-v1:ffffffffffffffff')).toBe(0);
    expect(fingerprintSimilarity(zero, 'dhash64-v1:0000000000000001')).toBe(63 / 64);
    for (const other of [
      'sha256:' + '0'.repeat(64),
      'fixture-first',
      'dhash64-v2:0000000000000000',
      'dhash64-v1:FFFFFFFFFFFFFFFF',
    ])
      expect(() => fingerprintDistance(zero, other)).toThrow();
  });
});
