import type { CollectedListing } from '@rei/domain';
import { ExternalFailure } from '../shared/index.js';
import type { ListingSource, RawListingDocument } from './listing-source.port.js';
import type { SourceRegisterRepository } from './source-register.repository.js';

/** Preserve historical prepared synthetic evidence; all discovered references stay transient. */
export async function prepareImageFingerprints(
  source: ListingSource,
  register: SourceRegisterRepository,
  original: RawListingDocument,
  listing: CollectedListing,
  synthetic: boolean,
  signal: AbortSignal,
  deadlineAt?: number,
  admit?: () => Promise<void>,
): Promise<CollectedListing> {
  if (synthetic && original.photoUrls === undefined) return listing;
  const current = await register.findById(original.sourceId, signal);
  signal.throwIfAborted();
  if (!current?.permissions.imageFetchingAllowed) return { ...listing, imageFingerprints: [] };
  const selected: string[] = [];
  for (const reference of original.photoUrls ?? []) {
    if (!selected.includes(reference)) selected.push(reference);
    if (selected.length === 3) break;
  }
  const fingerprints: string[] = [];
  for (const reference of selected) {
    await admit?.();
    const registration = await register.findById(original.sourceId, signal);
    signal.throwIfAborted();
    if (!registration?.permissions.imageFetchingAllowed || !source.fingerprintPhoto)
      throw new ExternalFailure({ kind: 'forbidden', operation: 'collection.source.photo' });
    const fingerprint = await source.fingerprintPhoto(
      original.sourceId,
      reference,
      signal,
      deadlineAt,
      admit,
    );
    signal.throwIfAborted();
    if (!/^dhash64-v1:[a-f0-9]{16}$/.test(fingerprint))
      throw new ExternalFailure({ kind: 'rejected', operation: 'collection.source.photo' });
    fingerprints.push(fingerprint);
  }
  return { ...listing, imageFingerprints: fingerprints };
}
