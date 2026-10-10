import { ExternalFailure, type ListingSource } from '@rei/application';
import { isOwnedSyntheticSourceId, parseCollectedListing } from '@rei/domain';

/** Correction-only fixture parser; original v1 acquisition validation remains unchanged. */
export const canonicalCorrectionParser: Pick<ListingSource, 'parse'> = Object.freeze({
  async parse(document, signal) {
    if (signal.aborted)
      throw new ExternalFailure({ kind: 'cancelled', operation: 'collection.source.parse' });
    if (!isOwnedSyntheticSourceId(document.sourceId))
      throw new ExternalFailure({ kind: 'forbidden', operation: 'collection.source.parse' });
    try {
      return parseCollectedListing(
        JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(document.bytes)),
        true,
      );
    } catch {
      throw new ExternalFailure({ kind: 'rejected', operation: 'collection.source.parse' });
    }
  },
});
