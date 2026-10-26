import type { ListingFact } from '../properties/index.js';
import { DomainValidationError, parseRfc3339Timestamp } from '../shared/index.js';
import { askingPriceMedian } from './asking-price-median.js';
import type { MarketEvidence, MarketFigure, MarketFigures } from './market.read.types.js';

export interface MarketStateEvidence {
  readonly revision: number;
  /** Membership is the current causal assignment, including for historical states. */
  readonly listing: ListingFact;
}
export interface MarketPriceChangeEvidence {
  readonly listing: ListingFact;
  readonly previousMinorUnits: number;
}
export interface MarketFiguresSnapshot {
  readonly representatives: readonly ListingFact[];
  readonly current: readonly ListingFact[];
  readonly history: readonly MarketStateEvidence[];
  readonly priceChanges: readonly MarketPriceChangeEvidence[];
}
const day = 86_400_000;

/** Six UTC calendar months, preserving time of day and clamping to the target month's last day. */
export function sixMonthsBefore(value: string): string {
  const date = new Date(parseRfc3339Timestamp(value, 'evaluatedAt'));
  const originalDay = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - 6);
  const end = new Date(date.getTime());
  end.setUTCMonth(end.getUTCMonth() + 1, 0);
  date.setUTCDate(Math.min(originalDay, end.getUTCDate()));
  return date.toISOString();
}
function observed(fact: ListingFact): number {
  return Date.parse(parseRfc3339Timestamp(fact.provenance.observedAt, 'observedAt'));
}
function representatives(facts: readonly ListingFact[]): ListingFact[] {
  const selected = new Map<string, ListingFact>();
  for (const fact of facts) {
    if (fact.status !== 'active') continue;
    const prior = selected.get(fact.propertyId);
    if (
      !prior ||
      fact.askingPriceMinorUnits < prior.askingPriceMinorUnits ||
      (fact.askingPriceMinorUnits === prior.askingPriceMinorUnits &&
        fact.listingId < prior.listingId)
    )
      selected.set(fact.propertyId, fact);
  }
  return [...selected.values()];
}
function evidence(
  facts: readonly ListingFact[],
  recordCount: number,
  computedAt: string,
): MarketEvidence {
  const sources = new Map<string, ListingFact>();
  for (const fact of facts) {
    const time = observed(fact);
    if (time > Date.parse(computedAt))
      throw new DomainValidationError('Observation follows computation.', 'observedAt');
    const previous = sources.get(fact.sourceId);
    if (
      !previous ||
      time > observed(previous) ||
      (time === observed(previous) && fact.listingId < previous.listingId)
    )
      sources.set(fact.sourceId, fact);
  }
  return {
    recordCount,
    sources: [...sources.values()]
      .sort((a, b) => (a.sourceId < b.sourceId ? -1 : 1))
      .map((fact) => ({
        id: fact.sourceId,
        label: fact.sourceId,
        url: fact.provenance.sourceUrl,
        collectedAt: fact.provenance.observedAt,
      })),
    computedAt,
    freshness: { status: 'untracked', latestCollectionCompletedAt: null, ageSeconds: 0 },
  };
}
function figure<T>(
  value: T | null,
  facts: readonly ListingFact[],
  count: number,
  at: string,
): MarketFigure<T> {
  const proof = evidence(facts, count, at);
  return value === null
    ? { ...proof, state: 'insufficient-data', value: null }
    : { ...proof, state: 'available', value };
}
function median(values: number[]): number {
  values.sort((a, b) => a - b);
  const index = Math.floor(values.length / 2);
  const upper = values[index]!;
  return values.length % 2 ? upper : values[index - 1]! + (upper - values[index - 1]!) / 2;
}

/** D-096. Current membership applies at both instants; movement uses only paired eligible
 * properties, so its current median can differ from the headline population. Duration is observed
 * age (fractional days), not source publication age. Reductions and their denominator count listings.
 */
export function remainingPlaceFigures(
  snapshot: MarketFiguresSnapshot,
  scopeIds: readonly string[],
  evaluatedAt: string,
): Omit<MarketFigures, 'medianAskingPricePerSquareMeter'> {
  const now = Date.parse(parseRfc3339Timestamp(evaluatedAt, 'evaluatedAt'));
  const cutoff = Date.parse(sixMonthsBefore(evaluatedAt));
  const scope = new Set(scopeIds);
  // Reuse the established validation and safe money rule, including null-area exclusion.
  askingPriceMedian(snapshot.current, scopeIds, evaluatedAt);
  const current = representatives(snapshot.current).filter((fact) => scope.has(fact.placeId));
  const properties = new Set(current.map((fact) => fact.propertyId));
  const active = snapshot.current.filter(
    (fact) => properties.has(fact.propertyId) && fact.status === 'active',
  );
  for (const fact of active) {
    evidence([fact], 1, evaluatedAt);
    if (Date.parse(parseRfc3339Timestamp(fact.effectiveAt, 'effectiveAt')) > now)
      throw new DomainValidationError('Effective state follows computation.', 'effectiveAt');
  }
  const priorStates = new Map<string, MarketStateEvidence>();
  for (const state of snapshot.history) {
    if (!Number.isSafeInteger(state.revision) || state.revision < 1)
      throw new DomainValidationError('Invalid retained revision.', 'revision');
    const effective = Date.parse(parseRfc3339Timestamp(state.listing.effectiveAt, 'effectiveAt'));
    if (effective > cutoff || observed(state.listing) > cutoff) continue;
    const previous = priorStates.get(state.listing.listingId);
    if (!previous || state.revision > previous.revision)
      priorStates.set(state.listing.listingId, state);
  }
  const prior = new Map(
    representatives([...priorStates.values()].map((state) => state.listing))
      .filter((fact) => scope.has(fact.placeId) && fact.areaSquareMeters !== null)
      .map((fact) => [fact.propertyId, fact]),
  );
  const currentPaired = current.filter(
    (fact) => fact.areaSquareMeters !== null && prior.has(fact.propertyId),
  );
  const priorPaired = currentPaired.map((fact) => prior.get(fact.propertyId)!);
  const currentMedian = askingPriceMedian(currentPaired, scopeIds, evaluatedAt);
  const priorMedian = askingPriceMedian(priorPaired, scopeIds, evaluatedAt);
  const movement =
    currentMedian.value && priorMedian.value
      ? (currentMedian.value.minorUnits / priorMedian.value.minorUnits - 1) * 100
      : null;
  if (movement !== null && (!Number.isFinite(movement) || movement > Number.MAX_SAFE_INTEGER))
    throw new DomainValidationError('Unsafe movement.', 'askingPriceMovement');
  const earliest = new Map<string, ListingFact>();
  for (const { listing } of snapshot.history) {
    if (!properties.has(listing.propertyId)) continue;
    const previous = earliest.get(listing.propertyId);
    if (
      !previous ||
      observed(listing) < observed(previous) ||
      (observed(listing) === observed(previous) && listing.listingId < previous.listingId)
    )
      earliest.set(listing.propertyId, listing);
  }
  // Current states also establish an observation when history is supplied by a detached fake port.
  for (const listing of snapshot.current) {
    if (!properties.has(listing.propertyId)) continue;
    const previous = earliest.get(listing.propertyId);
    if (!previous || observed(listing) < observed(previous))
      earliest.set(listing.propertyId, listing);
  }
  const ages = [...earliest.values()].map((fact) => (now - observed(fact)) / day);
  const activeIds = new Set(active.map((fact) => fact.listingId));
  const reductions = snapshot.priceChanges.filter(({ listing, previousMinorUnits }) => {
    if (!activeIds.has(listing.listingId)) return false;
    if (!Number.isSafeInteger(previousMinorUnits) || previousMinorUnits <= 0)
      throw new DomainValidationError('Unsafe previous asking price.', 'previousMinorUnits');
    const time = Date.parse(parseRfc3339Timestamp(listing.effectiveAt, 'effectiveAt'));
    if (time <= now - 30 * day || time > now) return false;
    evidence([listing], 1, evaluatedAt);
    return previousMinorUnits > listing.askingPriceMinorUnits;
  });
  const reduced = new Set(reductions.map(({ listing }) => listing.listingId)).size;
  return {
    askingPriceMovement: {
      ...figure(movement, [...currentPaired, ...priorPaired], currentPaired.length, evaluatedAt),
      windowMonths: 6,
    },
    medianTimeOnMarketDays: figure(
      ages.length ? median(ages) : null,
      [...earliest.values()],
      properties.size,
      evaluatedAt,
    ),
    priceReductions: {
      ...figure(
        active.length ? { count: reduced, percentage: (reduced / active.length) * 100 } : null,
        [...active, ...reductions.map(({ listing }) => listing)],
        active.length,
        evaluatedAt,
      ),
      windowDays: 30,
    },
    listingsPerProperty: figure(
      properties.size ? active.length / properties.size : null,
      active,
      properties.size,
      evaluatedAt,
    ),
    recordedSalePricePerSquareMeter: {
      ...evidence([], 0, evaluatedAt),
      state: 'not-recorded',
      value: null,
    },
  };
}
