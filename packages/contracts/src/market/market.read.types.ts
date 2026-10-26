import type { FixtureMetadata, PlaceRef } from '../locations/index.js';

export interface MarketSourceEvidence {
  readonly id: string;
  readonly label: string;
  readonly url: string;
  readonly collectedAt: string;
}
export interface MarketEvidence {
  readonly recordCount: number;
  readonly sources: readonly MarketSourceEvidence[];
  readonly computedAt: string;
  readonly freshness: {
    readonly status: 'fresh' | 'stale' | 'untracked';
    readonly latestCollectionCompletedAt: string | null;
    readonly ageSeconds: number;
  };
}
export type MarketFigure<T> = MarketEvidence &
  (
    | { readonly state: 'available'; readonly value: T }
    | { readonly state: 'insufficient-data'; readonly value: null }
  );
export interface MarketMoney {
  readonly minorUnits: number;
  readonly currency: 'BRL';
}
export type MarketMedian = MarketFigure<MarketMoney>;
export type MarketMovement = MarketFigure<number> & { readonly windowMonths: 6 };
export type MarketReductions = MarketFigure<{
  readonly count: number;
  readonly percentage: number;
}> & { readonly windowDays: 30 };
export interface MarketFigures {
  readonly medianAskingPricePerSquareMeter: MarketMedian;
  readonly askingPriceMovement: MarketMovement;
  readonly medianTimeOnMarketDays: MarketFigure<number>;
  readonly priceReductions: MarketReductions;
  readonly listingsPerProperty: MarketFigure<number>;
  readonly recordedSalePricePerSquareMeter: MarketEvidence & {
    readonly state: 'not-recorded';
    readonly value: null;
  };
}
export interface MarketCounts {
  readonly properties: number;
  readonly activeListings: number;
  readonly sources: number;
}
export interface MarketResponseBase {
  readonly metadata: FixtureMetadata;
  readonly basis: 'prepared-market-example';
  readonly evaluatedAt: string;
  readonly place: PlaceRef;
}
export const MARKET_PREPARED_SECTIONS = [
  'counts',
  'figures.askingPriceMovement',
  'figures.medianTimeOnMarketDays',
  'figures.priceReductions',
  'figures.listingsPerProperty',
  'figures.recordedSalePricePerSquareMeter',
] as const;
interface PlaceMarketOverview {
  readonly counts: MarketCounts;
  readonly figures: MarketFigures;
  readonly parentMedian: { readonly place: PlaceRef; readonly median: MarketMedian } | null;
}
export type PlaceMarketResponse = PlaceMarketOverview &
  (
    | MarketResponseBase
    | (Omit<MarketResponseBase, 'basis'> & {
        readonly basis: 'event-fed-median-with-prepared-sections';
        readonly preparedSections: typeof MARKET_PREPARED_SECTIONS;
        readonly preparedEvaluatedAt: string;
      })
    | (Omit<MarketResponseBase, 'basis'> & {
        readonly basis: 'event-fed-figures-with-prepared-counts';
        readonly preparedSections: readonly ['counts'];
        readonly preparedEvaluatedAt: string;
      })
  );
export interface PlaceMarketNeighboursResponse extends MarketResponseBase {
  readonly items: readonly {
    readonly place: PlaceRef;
    readonly median: MarketMedian;
    readonly movement: MarketMovement;
  }[];
}
export interface PlaceMarketSeriesResponse extends MarketResponseBase {
  readonly comparisonPlace: PlaceRef | null;
  readonly points: readonly {
    readonly month: string;
    readonly median: MarketMedian;
    readonly parentMedian: MarketMedian | null;
  }[];
}
