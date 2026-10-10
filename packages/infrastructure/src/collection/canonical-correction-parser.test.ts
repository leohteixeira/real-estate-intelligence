import { describe, expect, it } from 'vitest';
import { canonicalCorrectionParser } from './canonical-correction-parser.js';
import { SYNTHETIC_LISTING_BYTES, SyntheticListingSource } from './synthetic-listing-source.js';

const document = {
  sourceId: 'synthetic-data',
  sourceListingId: 'fixture',
  sourceUrl: 'https://synthetic.invalid/fixture',
  observedAt: '2026-10-10T00:00:00.000Z',
  mediaType: 'application/json' as const,
  bytes: SYNTHETIC_LISTING_BYTES,
};
describe('correction-only canonical parser', () => {
  it('accepts intentional empty arrays without changing original v1 acquisition parsing', async () => {
    const bytes = new TextEncoder().encode(
      JSON.stringify({
        ...JSON.parse(new TextDecoder().decode(document.bytes)),
        imageFingerprints: [],
      }),
    );
    expect(
      (await canonicalCorrectionParser.parse({ ...document, bytes }, new AbortController().signal))
        .imageFingerprints,
    ).toEqual([]);
    await expect(
      new SyntheticListingSource().parse({ ...document, bytes }, new AbortController().signal),
    ).rejects.toBeDefined();
    expect(Object.keys(canonicalCorrectionParser)).toEqual(['parse']);
  });
  it('rejects unknown/real sources, malformed bytes and cancellation without acquisition', async () => {
    await expect(
      canonicalCorrectionParser.parse(
        { ...document, sourceId: 'olx' },
        new AbortController().signal,
      ),
    ).rejects.toBeDefined();
    await expect(
      canonicalCorrectionParser.parse(
        { ...document, bytes: Uint8Array.of(255) },
        new AbortController().signal,
      ),
    ).rejects.toBeDefined();
    await expect(
      canonicalCorrectionParser.parse(document, AbortSignal.abort()),
    ).rejects.toBeDefined();
  });
});
