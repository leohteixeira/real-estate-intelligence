import { describe, expect, it, vi } from 'vitest';
import {
  createSourceRegistration,
  type CollectedListing,
  type SourceRegistration,
} from '@rei/domain';
import { ExternalFailure } from '../shared/index.js';
import { prepareImageFingerprints } from './prepare-image-fingerprints.js';
import type { ListingSource, RawListingDocument } from './listing-source.port.js';
import type { SourceRegisterRepository } from './source-register.repository.js';

const registration = createSourceRegistration({
  sourceId: 'photo-fixture',
  displayLabel: 'Local photo fixture',
  category: 'listing',
  enabled: true,
  enabledAt: '2026-10-10T00:00:00Z',
  permissions: {
    collectionAllowed: true,
    imageFetchingAllowed: true,
    listingTextDisplayAllowed: false,
  },
  review: {
    outcome: 'allowed',
    reviewedAt: '2026-10-09T00:00:00Z',
    evidence: 'Synthetic local fixture.',
  },
  access: { method: 'remote-http', detail: 'Local synthetic endpoint.' },
  rate: { status: 'configured', limit: 100, windowSeconds: 1 },
  licence: { status: 'licensed', label: 'Fixture', url: 'https://fixture.invalid/licence' },
});
const document: RawListingDocument = {
  sourceId: 'photo-fixture',
  sourceListingId: 'one',
  sourceUrl: 'https://fixture.invalid/one',
  observedAt: '2026-10-10T00:00:00Z',
  mediaType: 'application/json',
  bytes: new Uint8Array(),
  photoUrls: ['first', 'first', 'second', 'third', 'fourth'],
};
// Only the fingerprint field is read or changed by this preparation boundary.
const listing = { imageFingerprints: ['fixture-prepared'] } as CollectedListing;
function registry(findById: () => Promise<SourceRegistration | null>): SourceRegisterRepository {
  return {
    findById,
    assertCollectible: vi.fn(),
    holdAtomically: vi.fn(),
    clearHoldAfterReview: vi.fn(),
    enableAtomically: vi.fn(),
    listEnabled: vi.fn(),
  };
}
const source = (
  fingerprintPhoto: NonNullable<ListingSource['fingerprintPhoto']>,
): ListingSource => ({ fetchPage: vi.fn(), parse: vi.fn(), fingerprintPhoto });
const signal = () => AbortSignal.timeout(2_000);

describe('transient photo preparation', () => {
  it('selects first three distinct URLs in order and retains hash collisions', async () => {
    const calls: string[] = [];
    const prepared = await prepareImageFingerprints(
      source(async (_id, url) => {
        calls.push(url);
        return 'dhash64-v1:0000000000000000';
      }),
      registry(async () => registration),
      document,
      listing,
      false,
      signal(),
    );
    expect(calls).toEqual(['first', 'second', 'third']);
    expect(prepared.imageFingerprints).toEqual(Array(3).fill('dhash64-v1:0000000000000000'));
  });
  it('makes no request when denied or no references, and keeps prepared historical fixtures', async () => {
    const fingerprintPhoto = vi.fn();
    const denied = {
      ...registration,
      permissions: { ...registration.permissions, imageFetchingAllowed: false },
    };
    expect(
      (
        await prepareImageFingerprints(
          source(fingerprintPhoto),
          registry(async () => denied),
          document,
          listing,
          false,
          signal(),
        )
      ).imageFingerprints,
    ).toEqual([]);
    const noReferences = { ...document };
    Reflect.deleteProperty(noReferences, 'photoUrls');
    expect(
      (
        await prepareImageFingerprints(
          source(fingerprintPhoto),
          registry(async () => registration),
          noReferences,
          listing,
          false,
          signal(),
        )
      ).imageFingerprints,
    ).toEqual([]);
    expect(
      await prepareImageFingerprints(
        source(fingerprintPhoto),
        registry(async () => registration),
        noReferences,
        listing,
        true,
        signal(),
      ),
    ).toBe(listing);
    expect(fingerprintPhoto).not.toHaveBeenCalled();
  });
  it('never returns partial evidence on failure, revocation, malformed output or cancellation', async () => {
    const attempts = vi.fn(async () => {
      throw new ExternalFailure({ kind: 'rejected', operation: 'collection.source.photo' });
    });
    await expect(
      prepareImageFingerprints(
        source(attempts),
        registry(async () => registration),
        document,
        listing,
        false,
        signal(),
      ),
    ).rejects.toMatchObject({ kind: 'rejected' });
    expect(attempts).toHaveBeenCalledTimes(1);
    let reads = 0;
    const changing = registry(async () =>
      ++reads <= 2
        ? registration
        : {
            ...registration,
            permissions: { ...registration.permissions, imageFetchingAllowed: false },
          },
    );
    const fingerprintPhoto = vi.fn(async () => 'dhash64-v1:0000000000000000');
    await expect(
      prepareImageFingerprints(
        source(fingerprintPhoto),
        changing,
        document,
        listing,
        false,
        signal(),
      ),
    ).rejects.toMatchObject({ kind: 'forbidden' });
    expect(fingerprintPhoto).toHaveBeenCalledTimes(1);
    await expect(
      prepareImageFingerprints(
        source(async () => 'invented'),
        registry(async () => registration),
        document,
        listing,
        false,
        signal(),
      ),
    ).rejects.toMatchObject({ kind: 'rejected' });
    const controller = new AbortController();
    controller.abort();
    await expect(
      prepareImageFingerprints(
        source(fingerprintPhoto),
        registry(async () => registration),
        document,
        listing,
        false,
        controller.signal,
      ),
    ).rejects.toThrow();
  });
});
