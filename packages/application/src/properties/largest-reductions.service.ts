import {
  DomainValidationError,
  rankLargestReductions,
  type PageQuery,
  type ReductionsResponse,
} from '@rei/domain';
import type { LocationsFacade } from '../locations/index.js';
import type { Clock } from '../shared/index.js';
import type { PropertyReductionsRepository } from './property-reductions.repository.js';
import { pageReadItems, validateReadQuery } from './read-pagination.js';

export class LargestReductionsService {
  public constructor(
    private readonly repository: PropertyReductionsRepository,
    private readonly locations: Pick<LocationsFacade, 'registeredScopeIds'>,
    private readonly clock: Clock,
  ) {}
  public async execute(placeId: string, query: PageQuery): Promise<ReductionsResponse | null> {
    validateReadQuery(query, false);
    if (
      typeof placeId !== 'string' ||
      placeId.length > 200 ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(placeId)
    )
      throw new DomainValidationError('Invalid place identifier.', 'placeId');
    const scope = await this.locations.registeredScopeIds(placeId);
    if (scope === null) return null;
    const candidates = await this.repository.readCandidates(scope);
    const asOf =
      candidates.length === 0
        ? this.clock.now()
        : candidates.reduce(
            (latest, row) => (Date.parse(row.asOf) > Date.parse(latest) ? row.asOf : latest),
            candidates[0]!.asOf,
          );
    return structuredClone({
      metadata: {
        dataMode: 'synthetic-stub',
        fixtureVersion: 'persisted-synthetic-reductions-v1',
        asOf,
      },
      ...pageReadItems(rankLargestReductions(candidates, asOf), query, {
        endpoint: 'persisted-reductions',
        placeId,
        pageSize: query.pageSize ?? 20,
      }),
    });
  }
}
