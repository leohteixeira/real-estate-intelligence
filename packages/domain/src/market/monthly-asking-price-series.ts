import { DomainValidationError, parseRfc3339Timestamp } from '../shared/index.js';
import { askingPriceMedian } from './asking-price-median.js';
import type { LiveMarketSeriesPoint } from './market.read.types.js';
import type { MarketStateEvidence } from './remaining-place-figures.js';

/** D-097: independent UTC monthly populations, with current causal membership supplied by Market. */
export function monthlyAskingPriceSeries(
  history: readonly MarketStateEvidence[],
  scopeIds: readonly string[],
  parentScopeIds: readonly string[] | null,
  evaluatedAt: string,
): readonly LiveMarketSeriesPoint[] {
  const evaluated = new Date(parseRfc3339Timestamp(evaluatedAt, 'evaluatedAt'));
  // Validate every retained state, including evidence ineligible at the requested cutoffs.
  askingPriceMedian(
    history.map(({ listing }) => listing),
    [],
    evaluatedAt,
  );
  const states = history.map((state) => {
    if (!Number.isSafeInteger(state.revision) || state.revision < 1)
      throw new DomainValidationError('Invalid retained revision.', 'revision');
    return {
      state,
      effective: Date.parse(parseRfc3339Timestamp(state.listing.effectiveAt, 'effectiveAt')),
      observed: Date.parse(
        parseRfc3339Timestamp(state.listing.provenance.observedAt, 'observedAt'),
      ),
    };
  });
  return Array.from({ length: 12 }, (_, index) => {
    const start = new Date(evaluated);
    start.setUTCDate(1);
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCMonth(start.getUTCMonth() - 11 + index);
    const month = start.toISOString().slice(0, 7);
    start.setUTCMonth(start.getUTCMonth() + 1);
    const asOf = index === 11 ? evaluatedAt : new Date(start.getTime() - 1).toISOString();
    const cutoff = Date.parse(asOf);
    const selected = new Map<string, MarketStateEvidence>();
    for (const { state, effective, observed } of states) {
      if (effective > cutoff || observed > cutoff) continue;
      const prior = selected.get(state.listing.listingId);
      if (!prior || state.revision > prior.revision) selected.set(state.listing.listingId, state);
    }
    const facts = [...selected.values()].map(({ listing }) => listing);
    return {
      month,
      asOf,
      median: askingPriceMedian(facts, scopeIds, evaluatedAt),
      parentMedian:
        parentScopeIds === null ? null : askingPriceMedian(facts, parentScopeIds, evaluatedAt),
    };
  });
}
