import type { PlaceRef } from '../locations/index.js';
import type { ListingHistory, Reduction } from './properties.read.types.js';

/** Safe read facts: canonical effect order is retained, corrected values are absent. */
export interface ReductionCandidate {
  readonly propertyId: string;
  readonly listingId: string;
  readonly place: PlaceRef;
  readonly asOf: string;
  readonly priceChanges: readonly Extract<ListingHistory, { type: 'price-changed' }>[];
}

/** Dates select the latest drop; canonical publication position resolves equal instants. */
export function rankLargestReductions(
  candidates: readonly ReductionCandidate[],
  asOf: string,
): readonly Reduction[] {
  const items: Reduction[] = [];
  for (const candidate of candidates) {
    let latest: ReductionCandidate['priceChanges'][number] | undefined;
    for (const effect of candidate.priceChanges) {
      if (
        effect.currentMinorUnits >= effect.previousMinorUnits ||
        Date.parse(effect.effectiveAt) > Date.parse(asOf)
      )
        continue;
      if (!latest || Date.parse(effect.effectiveAt) >= Date.parse(latest.effectiveAt))
        latest = effect;
    }
    if (latest)
      items.push({
        propertyId: candidate.propertyId,
        listingId: candidate.listingId,
        place: { ...candidate.place, name: { ...candidate.place.name } },
        effectiveAt: latest.effectiveAt,
        previousMinorUnits: latest.previousMinorUnits,
        currentMinorUnits: latest.currentMinorUnits,
        reductionPercent:
          ((latest.previousMinorUnits - latest.currentMinorUnits) / latest.previousMinorUnits) *
          100,
        provenance: { ...latest.provenance },
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
