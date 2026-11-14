import type { ListingDetail, PropertyResponse } from '@rei/contracts';
import { placeName } from '../places/locale';

export const evidenceAnchor = (listingId: string) => `property-listing-${listingId}`;
export function propertyStreet(response: PropertyResponse, language: string): string {
  if (response.property.preparedEvidence.kind === 'deterministic-rule')
    return (
      response.property.listings[0]?.street ??
      placeName(response.property.summary.place.name, language)
    );
  const street = response.property.preparedEvidence.reasons.find(
    (reason) => reason.type === 'attribute-agreement' && reason.field === 'street',
  );
  return street?.type === 'attribute-agreement' && typeof street.value === 'string'
    ? street.value
    : placeName(response.property.summary.place.name, language);
}

/** Reveal native ancestors before the browser's ordinary hash navigation/focus. */
export function revealEvidenceTarget(id: string): void {
  const target = document.getElementById(id);
  if (!target) return;
  for (let ancestor = target.parentElement; ancestor; ancestor = ancestor.parentElement)
    if (ancestor instanceof HTMLDetailsElement) ancestor.open = true;
  target.focus({ preventScroll: true });
}

export function sourceLabel(response: PropertyResponse, sourceId: string): string {
  return (
    response.property.listings.find((listing) => listing.source.sourceId === sourceId)?.source
      .label ?? sourceId
  );
}

/** Shared time coordinates are geometry only; no business value is derived here. */
export function timeAxis(response: PropertyResponse) {
  const starts = response.property.listings.flatMap((listing) =>
    listing.lifeline.map((interval) => Date.parse(interval.from)),
  );
  const first = new Date(
    Math.min(Date.parse(response.property.summary.firstCollectedAt), ...starts),
  );
  const last = new Date(
    Math.max(
      Date.parse(response.metadata.asOf),
      Date.parse(response.property.summary.lastCollectedAt),
    ),
  );
  const from = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1);
  const to = Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + 1, 1);
  const months: string[] = [];
  for (let month = from; month < to; ) {
    const date = new Date(month);
    months.push(date.toISOString());
    month = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
  }
  const position = (instant: string) =>
    Math.max(0, Math.min(100, ((Date.parse(instant) - from) / (to - from)) * 100));
  return { months, position, through: response.metadata.asOf };
}

export function removedIntervals(listing: ListingDetail, through: string) {
  return listing.lifeline.flatMap((interval, index) =>
    interval.to === null
      ? []
      : [{ from: interval.to, to: listing.lifeline[index + 1]?.from ?? through }],
  );
}
