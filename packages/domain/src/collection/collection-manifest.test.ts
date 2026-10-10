import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { hashCollectionManifest, parseCollectionSourceListingId } from './collection-manifest.js';

describe('hashCollectionManifest', () => {
  it('hashes the canonical sorted JSON identity set', () => {
    const identities = ['listing-z', 'listing-a'];
    const expected = createHash('sha256')
      .update(JSON.stringify(['listing-a', 'listing-z']), 'utf8')
      .digest('hex');

    expect(hashCollectionManifest(identities)).toBe(`sha256:${expected}`);
    expect(hashCollectionManifest([...identities].reverse())).toBe(`sha256:${expected}`);
    expect(identities).toEqual(['listing-z', 'listing-a']);
  });

  it('uses the canonical empty manifest', () => {
    expect(hashCollectionManifest([])).toBe(
      'sha256:4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
    );
  });

  it.each([
    ['duplicate', ['one', 'one']],
    ['whitespace', ['not safe']],
    ['empty', ['']],
  ])('rejects an invalid %s identity set', (_case, identities) => {
    expect(() => hashCollectionManifest(identities)).toThrow(TypeError);
  });
});

describe('parseCollectionSourceListingId', () => {
  it('returns a safe printable ASCII identity', () => {
    expect(parseCollectionSourceListingId('AUR-BV-001:v2')).toBe('AUR-BV-001:v2');
  });

  it.each(['', 'contains whitespace', 'line\nbreak', 'não-ascii', 'x'.repeat(301)])(
    'rejects an unsafe identity %#',
    (identity) => {
      expect(() => parseCollectionSourceListingId(identity)).toThrow(
        'sourceListingId must contain 1-300 printable, non-whitespace ASCII characters.',
      );
    },
  );
});
