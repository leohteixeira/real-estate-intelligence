import type { PropertySummary } from '@rei/contracts';
import { parseSearchState } from '../search/search-state';

export function isPropertyId(value: string | undefined): value is string {
  return (
    value !== undefined &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

/** Only a validated applied Search URL may become a return destination. */
export function validSearchReturn(value: string | null): string | null {
  if (
    !value ||
    value.length > 4000 ||
    /[\\#]/.test(value) ||
    [...value].some((character) => character.charCodeAt(0) <= 32)
  )
    return null;
  const match = /^\/search\/([a-z0-9]+(?:-[a-z0-9]+)*)(\?[^#]*)?$/.exec(value);
  if (!match) return null;
  const state = parseSearchState(match[1]!, match[2] ?? '');
  return state.valid && !state.filters ? value : null;
}

export function propertyHref(id: string, returnTo: string): string {
  const path = `/properties/${id}`;
  const valid = validSearchReturn(returnTo);
  return valid ? `${path}?returnTo=${encodeURIComponent(valid)}` : path;
}

export function propertyNeighborhood(summary: PropertySummary) {
  return summary.place.kind === 'neighborhood'
    ? summary.place
    : summary.breadcrumbs.find((place) => place.kind === 'neighborhood');
}
