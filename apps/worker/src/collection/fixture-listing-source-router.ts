import {
  ExternalFailure,
  type ListingAdmission,
  type ListingSource,
  type ListingSourcePage,
  type RawListingDocument,
} from '@rei/application';
import { isOwnedSyntheticSourceId, type CollectedListing } from '@rei/domain';

/** Routes every owned fixture source to its compatible checked-in adapter. */
export class FixtureListingSourceRouter implements ListingSource {
  public constructor(
    private readonly labelledFixture: ListingSource,
    private readonly portalFixtures: ListingSource,
  ) {}

  public async fetchPage(
    sourceId: string,
    cursor: string | null,
    signal: AbortSignal,
    deadlineAt?: number,
    admit?: ListingAdmission,
  ): Promise<ListingSourcePage> {
    return this.sourceFor(sourceId).fetchPage(sourceId, cursor, signal, deadlineAt, admit);
  }

  public async parse(document: RawListingDocument, signal: AbortSignal): Promise<CollectedListing> {
    return this.sourceFor(document.sourceId).parse(document, signal);
  }

  public async fingerprintPhoto(
    sourceId: string,
    photoUrl: string,
    signal: AbortSignal,
    deadlineAt?: number,
  ): Promise<string> {
    const source = this.sourceFor(sourceId);
    if (!source.fingerprintPhoto)
      throw new ExternalFailure({ kind: 'forbidden', operation: 'collection.source.photo' });
    return source.fingerprintPhoto(sourceId, photoUrl, signal, deadlineAt);
  }

  private sourceFor(sourceId: string): ListingSource {
    if (sourceId === 'synthetic-data') return this.labelledFixture;
    if (isOwnedSyntheticSourceId(sourceId)) return this.portalFixtures;
    throw new ExternalFailure({
      kind: 'forbidden',
      operation: 'collection.source.route',
    });
  }
}
