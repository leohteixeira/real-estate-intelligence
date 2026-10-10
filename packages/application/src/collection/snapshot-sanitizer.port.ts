import type { CollectedListing } from '@rei/domain';
import type { RawListingDocument } from './listing-source.port.js';

export const SNAPSHOT_SANITIZER = Symbol.for('rei.SnapshotSanitizer');

export interface SanitizedSnapshot {
  readonly document: RawListingDocument;
  /** Close over known contact names so parser output cannot reintroduce them. */
  sanitizeParsed(listing: CollectedListing): CollectedListing;
}

export interface SnapshotSanitizer {
  sanitize(document: RawListingDocument): SanitizedSnapshot;
}
