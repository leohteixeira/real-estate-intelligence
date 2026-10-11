import type { ListingFact } from '../properties/index.js';
import { DomainValidationError, parseRfc3339Timestamp } from '../shared/index.js';
import type { MarketMedian, MarketSourceEvidence } from './market.read.types.js';
import { pricePerSquareMeter } from './price-per-square-meter.js';

/** ADR 0021: global active property minima precede geography and area eligibility.
 * Revisions are resolved by the read port. Observation time is not collection completion.
 */
export function askingPriceMedian(
  facts: readonly ListingFact[],
  registeredScopeIds: readonly string[],
  computedAt: string,
): MarketMedian {
  parseRfc3339Timestamp(computedAt, 'computedAt');
  const representatives = new Map<string, ListingFact>();
  for (const fact of facts) {
    if (!Number.isSafeInteger(fact.askingPriceMinorUnits) || fact.askingPriceMinorUnits <= 0)
      throw new DomainValidationError('Unsafe asking price.', 'askingPriceMinorUnits');
    if (
      fact.areaSquareMeters !== null &&
      (!Number.isFinite(fact.areaSquareMeters) ||
        fact.areaSquareMeters < 0.01 ||
        fact.areaSquareMeters > 1_000_000)
    )
      throw new DomainValidationError('Invalid listing area.', 'areaSquareMeters');
    if (fact.status !== 'active') continue;
    const previous = representatives.get(fact.propertyId);
    if (
      !previous ||
      fact.askingPriceMinorUnits < previous.askingPriceMinorUnits ||
      (fact.askingPriceMinorUnits === previous.askingPriceMinorUnits &&
        fact.listingId < previous.listingId)
    )
      representatives.set(fact.propertyId, fact);
  }
  const scope = new Set(registeredScopeIds);
  const values: number[] = [];
  const sources = new Map<string, { listingId: string; evidence: MarketSourceEvidence }>();
  for (const fact of representatives.values()) {
    if (!scope.has(fact.placeId) || fact.areaSquareMeters === null) continue;
    const value = pricePerSquareMeter({
      priceInCents: fact.askingPriceMinorUnits,
      areaInSquareMeters: fact.areaSquareMeters,
    });
    if (!Number.isSafeInteger(value) || value <= 0)
      throw new DomainValidationError('Unsafe price per square meter.', 'minorUnits');
    const observed = parseRfc3339Timestamp(fact.provenance.observedAt, 'observedAt');
    if (Date.parse(observed) > Date.parse(computedAt))
      throw new DomainValidationError('Observation follows computation.', 'observedAt');
    values.push(value);
    const previous = sources.get(fact.sourceId);
    if (
      !previous ||
      observed > previous.evidence.collectedAt ||
      (observed === previous.evidence.collectedAt && fact.listingId < previous.listingId)
    )
      sources.set(fact.sourceId, {
        listingId: fact.listingId,
        evidence: {
          id: fact.sourceId,
          label: fact.sourceId,
          url: fact.provenance.sourceUrl,
          collectedAt: observed,
        },
      });
  }
  values.sort((a, b) => a - b);
  const proof = {
    recordCount: values.length,
    sources: [...sources.values()]
      .map((source) => source.evidence)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    computedAt,
    freshness: {
      status: 'untracked' as const,
      latestCollectionCompletedAt: null,
      ageSeconds: 0,
    },
  };
  if (!values.length) return { ...proof, state: 'insufficient-data', value: null };
  const middle = Math.floor(values.length / 2);
  const upper = values[middle]!;
  // Difference is safe; adding two safe centavo values need not be safe.
  const lower = values[middle - 1] ?? upper;
  const minorUnits = values.length % 2 ? upper : lower + Math.round((upper - lower) / 2);
  return { ...proof, state: 'available', value: { minorUnits, currency: 'BRL' } };
}
