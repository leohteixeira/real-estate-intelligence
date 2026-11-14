import type {
  CollectionFacade,
  PropertiesFacade,
  LargestReductionsService,
  SearchPropertiesService,
} from '@rei/application';
import {
  latestReduction,
  type ListingResponse,
  type ListingDetail,
  type MinimumReduction,
  type Property,
  type PageQuery,
  type PropertyResponse,
  type ReductionsResponse,
  type SearchQuery,
  type SearchResponse,
} from '@rei/domain';
import {
  projectInitialProperty,
  projectCurrentPropertySummary,
} from './persisted-property.projection.js';
import type { PostgresPropertyRepository } from './postgres-property.repository.js';
import type { PostgresListingHistoryRepository } from './postgres-listing-history.repository.js';

/** Detail is persisted-first; search and reductions are persisted-only. */
export class PersistedPropertiesFacade implements PropertiesFacade {
  public constructor(
    private readonly repository: Pick<PostgresPropertyRepository, 'getProperty' | 'getListing'> &
      Partial<Pick<PostgresPropertyRepository, 'getCurrentGroup'>>,
    private readonly collection: Pick<
      CollectionFacade,
      'getSourcePermissions' | 'getSnapshotMetadata'
    >,
    private readonly prepared: PropertiesFacade,
    private readonly history?: Pick<PostgresListingHistoryRepository, 'getState'>,
    private readonly reductions?: Pick<LargestReductionsService, 'execute'>,
    private readonly searchService?: Pick<SearchPropertiesService, 'execute'>,
    private readonly suppression?: import('@rei/application').ListingSuppressionAuthority,
  ) {}
  public search(query: SearchQuery): Promise<SearchResponse> {
    if (!this.searchService) throw new Error('Persisted search query is unavailable.');
    return this.searchService.execute(query);
  }
  public largestReductions(placeId: string, query: PageQuery): Promise<ReductionsResponse | null> {
    if (!this.reductions) throw new Error('Persisted reductions query is unavailable.');
    return this.reductions.execute(placeId, query);
  }
  public async getProperty(id: string): Promise<PropertyResponse | null> {
    const property = await this.repository.getProperty(id);
    if (property) return this.projectPersisted(property);
    const response = await this.prepared.getProperty(id);
    if (
      !response ||
      (
        await Promise.all(response.property.listings.map((listing) => this.isSuppressed(listing)))
      ).some(Boolean)
    )
      return null;
    return {
      ...response,
      property: {
        ...response.property,
        listings: await Promise.all(
          response.property.listings.map((listing) => this.applyRights(listing)),
        ),
      },
    };
  }
  public async getListing(id: string): Promise<ListingResponse | null> {
    const property = await this.repository.getListing(id);
    if (!property) {
      const response = await this.prepared.getListing(id);
      return response && !(await this.isSuppressed(response.listing))
        ? { ...response, listing: await this.applyRights(response.listing) }
        : null;
    }
    const response = await this.projectPersisted(property);
    return {
      metadata: response.metadata,
      listing: response.property.listings.find((listing) => listing.id === id)!,
    };
  }

  private async projectPersisted(property: Property): Promise<PropertyResponse> {
    const group = await this.repository.getCurrentGroup?.(property.listingId);
    if (group) {
      const members = [];
      for (const member of group.members)
        members.push(
          await this.projectMember(
            member,
            group.states.find((state) => state.listingId === member.listingId)?.state ?? null,
          ),
        );
      const first = members[0]!;
      const listings = members
        .flatMap((member) => member.property.listings)
        .map((listing, index) => ({
          ...listing,
          propertyId: group.propertyId,
          position: index + 1,
          fixtureLabel: 'Persisted synthetic listing; deterministic identity rules',
        }));
      const { summary, asOf } = projectCurrentPropertySummary(
        group.propertyId,
        members,
        group.priceChanges,
      );
      const fields = [
        'propertyType',
        'areaSquareMeters',
        'bedrooms',
        'bathrooms',
        'parkingSpaces',
        'neighborhood',
      ] as const;
      return {
        metadata: { ...first.metadata, fixtureVersion: 'persisted-synthetic-resolution-v1', asOf },
        property: {
          ...first.property,
          summary,
          listings,
          // Each entry is one member listing's own dated asking-price change, with that listing's
          // provenance. The current price is the lowest active listing, so a member leaving,
          // returning or undercutting another source moves it without any price having changed;
          // those minimum effects stay with the summary and reductions, never in this history.
          priceChanges: members
            .flatMap((member) => member.property.priceChanges)
            .sort((a, b) => Date.parse(a.effectiveAt) - Date.parse(b.effectiveAt)),
          // The reductions read ranks the same effects; without the minimum rule it ranks the
          // requested listing's own history, exactly as that read does.
          minimumReduction: minimumReduction(
            group.minimumRule
              ? group.priceChanges
              : (
                  members.find(
                    (member) => member.property.listings[0]!.id === property.listingId,
                  ) ?? first
                ).property.priceChanges,
          ),
          sourceAgreement: fields.map((field) => {
            const values = listings.map((listing) => ({
              listingId: listing.id,
              sourceId: listing.source.sourceId,
              value: field === 'neighborhood' ? listing.publishedNeighborhood : listing[field],
            }));
            return {
              field,
              values,
              agrees: values.every((value) => value.value === values[0]!.value),
            };
          }),
          featureAgreement: [...new Set(listings.flatMap((listing) => listing.features))]
            .sort()
            .map((feature) => {
              const reporting = listings.filter((listing) => listing.features.includes(feature));
              return {
                feature,
                reportingCount: reporting.length,
                reportingPercent: (reporting.length / listings.length) * 100,
                listingIds: reporting.map((listing) => listing.id),
                sourceIds: [...new Set(reporting.map((listing) => listing.source.sourceId))],
              };
            }),
          preparedEvidence: {
            kind: 'deterministic-rule',
            label: 'D-092 deterministic identity rules; probabilities are not calibrated',
            listingIds: listings.map((listing) => listing.id),
            productionMatchScore: group.comparisons.length
              ? Math.min(...group.comparisons.map((pair) => pair.probability))
              : null,
            rawProbability: group.comparisons.length
              ? Math.min(...group.comparisons.map((pair) => pair.rawProbability))
              : null,
            probabilityBasis: 'deterministic-uncalibrated',
            configurationId: group.configuration.id,
            configurationVersion: group.configuration.version,
            reasons: group.comparisons.flatMap((pair) =>
              pair.reasons.map((reason) => ({
                type: 'rule-comparison' as const,
                listingIds: [pair.leftListingId, pair.rightListingId],
                feature: reason.feature,
                available: reason.available,
                score: reason.score,
                contribution: reason.contribution,
              })),
            ),
          },
        },
      };
    }
    const member = await this.projectMember(property);
    return {
      ...member,
      property: {
        ...member.property,
        minimumReduction: minimumReduction(member.property.priceChanges),
      },
    };
  }

  private async projectMember(
    property: Property,
    stateOverride?: import('@rei/domain').ListingChronologyState | null,
  ): Promise<PropertyResponse> {
    const state =
      stateOverride === undefined
        ? ((await this.history?.getState(property.listingId)) ?? null)
        : stateOverride;
    const projected = projectInitialProperty(property, true, state);
    const listing = projected.property.listings[0]!;
    const snapshot = await this.collection.getSnapshotMetadata(listing.provenance);
    return {
      ...projected,
      property: {
        ...projected.property,
        listings: [await this.applyRights({ ...listing, snapshot })],
      },
    };
  }

  private async isSuppressed(listing: ListingDetail): Promise<boolean> {
    return (
      (await this.suppression?.isSuppressed(
        {
          sourceId: listing.provenance.sourceId,
          sourceListingId: listing.provenance.sourceListingId,
        },
        new AbortController().signal,
      )) ?? false
    );
  }

  private async applyRights(listing: ListingDetail): Promise<ListingDetail> {
    const rights = await this.collection.getSourcePermissions(listing.source.sourceId);
    // The source register owns the published name; each source keeps its own attribution.
    const source = { ...listing.source, label: rights.displayLabel ?? listing.source.label };
    if (rights.listingTextDisplayAllowed || listing.description.permission === 'denied')
      return structuredClone({ ...listing, source });
    const changedAt = [
      ...new Set([
        ...listing.description.versions.slice(1).map((version) => version.effectiveAt),
        ...listing.history
          .filter((entry) => entry.type === 'description-changed')
          .map((entry) => entry.effectiveAt),
      ]),
    ].sort((a, b) => Date.parse(a) - Date.parse(b));
    return structuredClone({
      ...listing,
      source,
      description: { permission: 'denied', changedAt, sourceUrl: listing.description.sourceUrl },
    });
  }
}

/** The figure `largestReductions` reports for this property, from the same effects and rule. */
function minimumReduction(
  priceChanges: Parameters<typeof latestReduction>[0],
): MinimumReduction | null {
  const latest = latestReduction(priceChanges);
  return (
    latest && {
      effectiveAt: latest.effectiveAt,
      previousMinorUnits: latest.previousMinorUnits,
      currentMinorUnits: latest.currentMinorUnits,
      reductionPercent: latest.reductionPercent,
    }
  );
}
