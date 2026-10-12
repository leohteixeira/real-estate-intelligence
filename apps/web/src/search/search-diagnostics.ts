import type { SearchQuery } from '@rei/contracts';
import { activeGroups } from './search-state';
import type { FilterGroupId } from './search-state';

export type EmptyDiagnosis =
  | { readonly kind: 'neutral' }
  | { readonly kind: 'filter'; readonly group: FilterGroupId; readonly excluded: number };
export async function diagnoseEmpty(
  query: SearchQuery,
  read: (query: SearchQuery) => Promise<{ readonly totalItems: number }>,
): Promise<EmptyDiagnosis> {
  let prefix: SearchQuery = { placeId: query.placeId! };
  let previous = (await read(prefix)).totalItems;
  if (previous === 0) return { kind: 'neutral' };
  for (const group of activeGroups(query)) {
    const values = Object.fromEntries(
      group.keys.filter((key) => query[key] !== undefined).map((key) => [key, query[key]]),
    );
    prefix = { ...prefix, ...values };
    const current = (await read(prefix)).totalItems;
    if (previous > 0 && current === 0)
      return { kind: 'filter', group: group.id, excluded: previous };
    previous = current;
  }
  return { kind: 'neutral' };
}
