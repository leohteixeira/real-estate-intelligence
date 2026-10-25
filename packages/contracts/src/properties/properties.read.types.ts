import type { FixtureMetadata, PlaceRef } from '../locations/index.js';

export const PROPERTY_TYPES = [
  'apartment',
  'house',
  'studio',
  'commercial',
  'land',
  'condominium',
  'other',
] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];
export const PROPERTY_SORTS = [
  'furthest-below-median',
  'lowest-price-per-square-meter',
  'longest-on-market',
  'most-recent',
] as const;
export type PropertySort = (typeof PROPERTY_SORTS)[number];
export const TIME_ON_MARKET_BANDS = ['up-to-30', '31-to-90', 'over-90', 'over-180'] as const;
export interface SearchQuery {
  readonly placeId?: string;
  readonly propertyType?: PropertyType;
  readonly minAskingPrice?: number;
  readonly maxAskingPrice?: number;
  readonly minPricePerSquareMeter?: number;
  readonly maxPricePerSquareMeter?: number;
  readonly minArea?: number;
  readonly maxArea?: number;
  readonly minBedrooms?: number;
  readonly minBathrooms?: number;
  readonly minParkingSpaces?: number;
  readonly timeOnMarket?: (typeof TIME_ON_MARKET_BANDS)[number];
  readonly priceReduced?: boolean;
  readonly returnedToMarket?: boolean;
  readonly multipleListings?: boolean;
  readonly sort?: PropertySort;
  readonly pageSize?: number;
  readonly cursor?: string;
}
export interface PageQuery {
  readonly pageSize?: number;
  readonly cursor?: string;
}
export interface ListingProvenance {
  readonly sourceId: string;
  readonly sourceListingId: string;
  readonly sourceUrl: string;
  readonly runId: string;
  readonly snapshotId: string;
  readonly contentHash: string;
  readonly observedAt: string;
}
export interface AskingPrice {
  readonly minorUnits: number;
  readonly currency: 'BRL';
  readonly listingId: string;
  readonly provenance: ListingProvenance;
}
export interface PropertySummary {
  readonly id: string;
  readonly fixtureLabel: string;
  readonly propertyType: PropertyType;
  readonly place: PlaceRef;
  readonly breadcrumbs: readonly PlaceRef[];
  readonly areaSquareMeters: number | null;
  readonly bedrooms: number | null;
  readonly bathrooms: number | null;
  readonly parkingSpaces: number | null;
  readonly askingPrice: AskingPrice | null;
  readonly pricePerSquareMeter: number | null;
  readonly timeOnMarketDays: number;
  readonly firstCollectedAt: string;
  readonly lastCollectedAt: string;
  readonly activeListingCount: number;
  readonly priceReduced: boolean;
  readonly returnedToMarket: boolean;
  readonly belowMedianPercent: number | null;
  readonly neighborhoodComparison: null;
}
export interface SearchResponse {
  readonly metadata: FixtureMetadata;
  readonly items: readonly PropertySummary[];
  readonly nextCursor: string | null;
  readonly totalItems: number;
  readonly medianPricePerSquareMeter: number | null;
  readonly placeCounts: readonly { readonly placeId: string; readonly totalItems: number }[];
}
export interface PriceChange {
  readonly effectiveAt: string;
  readonly previousMinorUnits: number;
  readonly currentMinorUnits: number;
  readonly changePercent: number;
  readonly provenance: ListingProvenance;
}
export type ListingHistory =
  | {
      readonly type: 'created';
      readonly effectiveAt: string;
      readonly provenance: ListingProvenance;
    }
  | {
      readonly type: 'price-changed';
      readonly effectiveAt: string;
      readonly previousMinorUnits: number;
      readonly currentMinorUnits: number;
      readonly provenance: ListingProvenance;
    }
  | {
      readonly type: 'description-changed';
      readonly effectiveAt: string;
      readonly beforeHash: string;
      readonly afterHash: string;
      readonly provenance: ListingProvenance;
    }
  | {
      readonly type: 'removed';
      readonly effectiveAt: string;
      readonly provenance: ListingProvenance;
    }
  | {
      readonly type: 'reappeared';
      readonly effectiveAt: string;
      readonly provenance: ListingProvenance;
    };
export type ListingDescription =
  | {
      readonly permission: 'allowed';
      readonly current: string;
      readonly versions: readonly {
        readonly effectiveAt: string;
        readonly text: string;
        readonly contentHash: string;
      }[];
      readonly sourceUrl: string;
    }
  | {
      readonly permission: 'denied';
      readonly changedAt: readonly string[];
      readonly sourceUrl: string;
    };
export interface ListingDetail {
  readonly id: string;
  readonly propertyId: string;
  readonly fixtureLabel: string;
  readonly source: {
    readonly sourceId: string;
    readonly sourceListingId: string;
    readonly label: string;
    readonly url: string;
  };
  readonly position: number;
  readonly status: 'active' | 'removed';
  readonly propertyType: PropertyType;
  readonly place: PlaceRef;
  readonly publishedNeighborhood: string;
  readonly street: string;
  readonly areaSquareMeters: number | null;
  readonly bedrooms: number | null;
  readonly bathrooms: number | null;
  readonly parkingSpaces: number | null;
  readonly features: readonly string[];
  readonly askingPriceMinorUnits: number;
  readonly currency: 'BRL';
  readonly pricePerSquareMeter: number | null;
  readonly pricePerSquareMeterFormula: 'askingPriceMinorUnits / areaSquareMeters';
  readonly provenance: ListingProvenance;
  readonly snapshot: {
    readonly availability: 'available' | 'expired' | 'unavailable';
    readonly collectedAt: string;
    readonly expiresAt: string | null;
  };
  readonly collectionCount: number;
  readonly firstCollectedAt: string;
  readonly lastCollectedAt: string;
  readonly fieldEffectiveAt: {
    readonly askingPrice: string;
    readonly description: string;
    readonly attributes: string;
  };
  readonly description: ListingDescription;
  readonly history: readonly ListingHistory[];
  readonly lifeline: readonly { readonly from: string; readonly to: string | null }[];
}
export interface ListingResponse {
  readonly metadata: FixtureMetadata;
  readonly listing: ListingDetail;
}
export interface PropertyDetail {
  readonly summary: PropertySummary;
  readonly sale: { readonly status: 'not-recorded' };
  readonly listings: readonly ListingDetail[];
  readonly priceChanges: readonly PriceChange[];
  readonly sourceAgreement: readonly {
    readonly field:
      | 'propertyType'
      | 'areaSquareMeters'
      | 'bedrooms'
      | 'bathrooms'
      | 'parkingSpaces'
      | 'neighborhood';
    readonly values: readonly {
      readonly listingId: string;
      readonly sourceId: string;
      readonly value: string | number | null;
    }[];
    readonly agrees: boolean;
  }[];
  readonly featureAgreement: readonly {
    readonly feature: string;
    readonly reportingCount: number;
    readonly reportingPercent: number;
    readonly listingIds: readonly string[];
    readonly sourceIds: readonly string[];
  }[];
  readonly preparedEvidence:
    | {
        readonly kind: 'prepared-fixture';
        readonly label: string;
        readonly listingIds: readonly string[];
        readonly productionMatchScore: null;
        readonly illustrativeProbability: number;
        readonly probabilityBasis: 'prepared-not-calibrated';
        readonly reasons: readonly PreparedGroupingReason[];
      }
    | {
        readonly kind: 'deterministic-rule';
        readonly label: string;
        readonly listingIds: readonly string[];
        readonly productionMatchScore: number | null;
        readonly rawProbability: number | null;
        readonly probabilityBasis: 'deterministic-uncalibrated';
        readonly configurationId: string;
        readonly configurationVersion: number;
        readonly reasons: readonly RuleGroupingReason[];
      };
}
export interface RuleGroupingReason {
  readonly type: 'rule-comparison';
  readonly listingIds: readonly string[];
  readonly feature: 'coordinates' | 'images' | 'area' | 'bedrooms' | 'description';
  readonly available: boolean;
  readonly score: number | null;
  readonly contribution: number;
}
export type PreparedGroupingReason =
  | {
      readonly type: 'attribute-agreement';
      readonly field:
        | 'propertyType'
        | 'areaSquareMeters'
        | 'bedrooms'
        | 'bathrooms'
        | 'parkingSpaces'
        | 'street';
      readonly value: string | number;
      readonly listingIds: readonly string[];
    }
  | {
      readonly type: 'shared-structured-feature';
      readonly feature: string;
      readonly listingIds: readonly string[];
    }
  | {
      readonly type: 'published-neighborhood-disagreement';
      readonly values: readonly { readonly listingId: string; readonly neighborhood: string }[];
    };
export interface PropertyResponse {
  readonly metadata: FixtureMetadata;
  readonly property: PropertyDetail;
}
export interface Reduction {
  readonly propertyId: string;
  readonly listingId: string;
  readonly place: PlaceRef;
  readonly effectiveAt: string;
  readonly previousMinorUnits: number;
  readonly currentMinorUnits: number;
  readonly reductionPercent: number;
  readonly provenance: ListingProvenance;
}
export interface ReductionsResponse {
  readonly metadata: FixtureMetadata;
  readonly items: readonly Reduction[];
  readonly nextCursor: string | null;
  readonly totalItems: number;
}
