import type { ListingAdmission } from './listing-suppression.port.js';
import {
  SOURCE_ACCESS_REFUSALS,
  type CollectedListing,
  type SourceAccessRefusal,
} from '@rei/domain';

import { ExternalFailure } from '../shared/index.js';

/** Canonical access refusal; no HTTP status or vendor error crosses this port. */
export class ListingSourceAccessRefusal extends ExternalFailure {
  public constructor(public readonly reason: SourceAccessRefusal) {
    super({ kind: 'forbidden', operation: 'collection.source.fetch-page' });
    if (!SOURCE_ACCESS_REFUSALS.includes(reason))
      throw new TypeError('Unsupported access refusal.');
    this.name = 'ListingSourceAccessRefusal';
  }
}

export const LISTING_SOURCE = Symbol.for('rei.ListingSource');

export interface RawListingDocument {
  readonly sourceId: string;
  readonly sourceListingId: string;
  readonly sourceUrl: string;
  readonly observedAt: string;
  readonly mediaType: 'application/json';
  readonly bytes: Uint8Array;
  /** Transient discovery metadata; never part of snapshot bytes or parsed evidence. */
  readonly photoUrls?: readonly string[];
}

export interface ListingSourcePage {
  readonly documents: readonly RawListingDocument[];
  readonly suppressedListingIds?: readonly string[];
  readonly nextCursor: string | null;
  readonly exhausted: boolean;
}

/** Consumer-owned capability for acquiring and parsing source bytes in two explicit phases. */
export interface ListingSource {
  fetchPage(
    sourceId: string,
    cursor: string | null,
    signal: AbortSignal,
    deadlineAt?: number,
    admit?: ListingAdmission,
  ): Promise<ListingSourcePage>;
  parse(document: RawListingDocument, signal: AbortSignal): Promise<CollectedListing>;
  /** Single photo attempt, returning only computed evidence across the boundary. */
  fingerprintPhoto?(
    sourceId: string,
    photoUrl: string,
    signal: AbortSignal,
    deadlineAt?: number,
    admit?: () => Promise<void>,
  ): Promise<string>;
}

/** Documents the closed failure type adapters are required to use. */
export type ListingSourceFailure = ExternalFailure;
