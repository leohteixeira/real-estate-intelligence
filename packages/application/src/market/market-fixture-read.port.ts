import type { FixtureMetadata, MarketCounts, MarketFigures, MarketMedian } from '@rei/domain';

export interface PreparedMarketSample {
  readonly metadata: FixtureMetadata;
  readonly basis: 'prepared-market-example';
  readonly evaluatedAt: string;
  readonly counts: MarketCounts;
  readonly figures: MarketFigures;
  readonly points: readonly { readonly month: string; readonly median: MarketMedian }[];
}
/** Own prepared examples only; this port makes no production calculation or persistence claim. */
export interface MarketFixtureReadPort {
  read(scopeIds: readonly string[]): Promise<PreparedMarketSample>;
}
