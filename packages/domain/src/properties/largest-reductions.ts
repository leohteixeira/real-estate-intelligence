import type { PlaceRef } from '../locations/index.js';
import type { ListingHistory, MinimumReduction, Reduction } from './properties.read.types.js';

/** Safe read facts: canonical effect order is retained, corrected values are absent. */
export interface ReductionCandidate {
  readonly propertyId: string;
  readonly listingId: string;
  readonly place: PlaceRef;
  readonly asOf: string;
  readonly priceChanges: readonly Extract<ListingHistory, { type: 'price-changed' }>[];
}

type PriceEffect = Pick<
  ReductionCandidate['priceChanges'][number],
  'effectiveAt' | 'previousMinorUnits' | 'currentMinorUnits'
>;

/**
 * The single reduction figure of one property: its latest dated drop, with the later canonical
 * position winning equal instants. The place panel and the property page both read it here.
 */
export function latestReduction<Effect extends PriceEffect>(
  priceChanges: readonly Effect[],
  asOf?: string,
): (MinimumReduction & { readonly effect: Effect }) | null {
  let latest: Effect | undefined;
  for (const effect of priceChanges) {
    if (
      effect.currentMinorUnits >= effect.previousMinorUnits ||
      (asOf !== undefined && Date.parse(effect.effectiveAt) > Date.parse(asOf))
    )
      continue;
    if (!latest || Date.parse(effect.effectiveAt) >= Date.parse(latest.effectiveAt))
      latest = effect;
  }
  return latest
    ? {
        effect: latest,
        effectiveAt: latest.effectiveAt,
        previousMinorUnits: latest.previousMinorUnits,
        currentMinorUnits: latest.currentMinorUnits,
        reductionPercent:
          ((latest.previousMinorUnits - latest.currentMinorUnits) / latest.previousMinorUnits) *
          100,
      }
    : null;
}

/** Dates select the latest drop; canonical publication position resolves equal instants. */
export function rankLargestReductions(
  candidates: readonly ReductionCandidate[],
  asOf: string,
): readonly Reduction[] {
  const items: Reduction[] = [];
  for (const candidate of candidates) {
    const latest = latestReduction(candidate.priceChanges, asOf);
    if (latest)
      items.push({
        propertyId: candidate.propertyId,
        listingId: candidate.listingId,
        place: { ...candidate.place, name: { ...candidate.place.name } },
        effectiveAt: latest.effectiveAt,
        previousMinorUnits: latest.previousMinorUnits,
        currentMinorUnits: latest.currentMinorUnits,
        reductionPercent: latest.reductionPercent,
        provenance: { ...latest.effect.provenance },
      });
  }
  return items.sort((a, b) => {
    // Cross multiplication avoids lost ratio ordering near the safe integer money boundary.
    const difference =
      BigInt(b.previousMinorUnits - b.currentMinorUnits) * BigInt(a.previousMinorUnits) -
      BigInt(a.previousMinorUnits - a.currentMinorUnits) * BigInt(b.previousMinorUnits);
    return difference > 0n ? 1 : difference < 0n ? -1 : a.propertyId.localeCompare(b.propertyId);
  });
}
