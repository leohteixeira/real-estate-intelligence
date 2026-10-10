import {
  DomainValidationError,
  parsePublishedAddress,
  selectUniqueBlock,
  type PlaceResponse,
  type PlacesResponse,
  type PublishedAddress,
  type ResolvedPropertyPlace,
} from '@rei/domain';
import type { PlaceRepository } from './place.repository.js';
import type { Transaction } from '../shared/index.js';

function placeId(id: string): void {
  if (typeof id !== 'string' || id.length > 200 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))
    throw new DomainValidationError('Invalid place identifier.', 'placeId');
}
export class LocationsQueryService {
  public constructor(private readonly repository: PlaceRepository) {}
  public async resolvePublishedAddress(
    input: PublishedAddress,
    transaction?: Transaction,
  ): Promise<ResolvedPropertyPlace | null> {
    const address = parsePublishedAddress(input);
    const match = selectUniqueBlock(
      await this.repository.addressCandidates(address, transaction),
      address.number,
    );
    if (!match) return null;
    const { id, kind, name, breadcrumbs } = match.detail;
    return structuredClone({ place: { id, kind, name }, breadcrumbs });
  }
  public async roots(): Promise<PlacesResponse> {
    return structuredClone({
      metadata: await this.repository.metadata(),
      items: (await this.repository.roots()).map((place) => place.detail),
    });
  }
  public async getPlace(id: string): Promise<PlaceResponse | null> {
    placeId(id);
    const place = await this.repository.findById(id);
    return place
      ? structuredClone({ metadata: await this.repository.metadata(), place: place.detail })
      : null;
  }
  public async children(id: string): Promise<PlacesResponse | null> {
    placeId(id);
    if (!(await this.repository.findById(id))) return null;
    return structuredClone({
      metadata: await this.repository.metadata(),
      items: (await this.repository.children(id)).map((place) => place.detail),
    });
  }
}
