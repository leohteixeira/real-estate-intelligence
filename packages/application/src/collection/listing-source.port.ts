import type { CollectedListing } from '@rei/domain';

import type { ExternalFailure } from '../shared/index.js';

export const LISTING_SOURCE = Symbol.for('rei.ListingSource');

export interface RawListingDocument {
  readonly sourceId: string;
  readonly sourceListingId: string;
  readonly sourceUrl: string;
  readonly observedAt: string;
  readonly mediaType: 'application/json';
  readonly bytes: Uint8Array;
}

export interface ListingSourcePage {
  readonly documents: readonly RawListingDocument[];
  readonly nextCursor: string | null;
  readonly exhausted: boolean;
}

/** Consumer-owned capability for acquiring and parsing source bytes in two explicit phases. */
export interface ListingSource {
  fetchPage(
    sourceId: string,
    cursor: string | null,
    signal: AbortSignal,
  ): Promise<ListingSourcePage>;
  parse(document: RawListingDocument, signal: AbortSignal): Promise<CollectedListing>;
}

/** Documents the closed failure type adapters are required to use. */
export type ListingSourceFailure = ExternalFailure;
