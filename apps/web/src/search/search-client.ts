import { parsePlacesResponse, parseSearchResponse } from '@rei/contracts';
import type { PlaceDetail, PlacesResponse, SearchQuery } from '@rei/contracts';
import { ApiReadError, createApiClient } from '../api/client';
import { isPlaceId } from '../places/place-client';
import { parseSearchState, queryParameters } from './search-state';

export function createSearchClient(baseUrl?: string) {
  const transport = createApiClient(baseUrl);
  async function children(id: string, signal: AbortSignal): Promise<PlacesResponse> {
    if (!isPlaceId(id)) throw new ApiReadError(400);
    const result = await transport.read(`/places/${id}/children`, signal, parsePlacesResponse);
    if (result.items.some((place) => place.parentId !== id)) throw new ApiReadError(502);
    return result;
  }
  return {
    children,
    async search(query: SearchQuery, signal: AbortSignal) {
      const { placeId, cursor, ...inputs } = query;
      if (
        !placeId ||
        !parseSearchState(placeId, queryParameters(inputs).toString()).valid ||
        (cursor !== undefined && (!/^[A-Za-z0-9_-]+$/.test(cursor) || cursor.length > 2048))
      )
        throw new ApiReadError(400);
      const result = await transport.read(
        `/properties?${queryParameters(query)}`,
        signal,
        parseSearchResponse,
      );
      if (result.items.length > (query.pageSize ?? 20) || result.items.length > result.totalItems)
        throw new ApiReadError(502);
      return result;
    },
    async hierarchy(signal: AbortSignal): Promise<PlacesResponse> {
      const roots = await transport.read('/places', signal, parsePlacesResponse);
      const items: PlaceDetail[] = [];
      const visited = new Set<string>();
      const kinds = ['country', 'state', 'city', 'zone', 'neighborhood', 'street-block'];
      const pending = roots.items.map((place) => ({ place, depth: 0 }));
      for (let index = 0; index < pending.length; index++) {
        const { place, depth } = pending[index]!;
        if (visited.has(place.id) || depth >= kinds.length || items.length >= 2000)
          throw new ApiReadError(502);
        visited.add(place.id);
        items.push(place);
        if (place.kind === 'street-block') continue;
        const next = await children(place.id, signal);
        if (next.items.some((child) => kinds.indexOf(child.kind) !== kinds.indexOf(place.kind) + 1))
          throw new ApiReadError(502);
        pending.push(...next.items.map((child) => ({ place: child, depth: depth + 1 })));
      }
      return { metadata: roots.metadata, items };
    },
  };
}
