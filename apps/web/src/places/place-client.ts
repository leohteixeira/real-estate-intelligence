import { parsePlaceResponse, parsePlacesResponse, parsePlaceMarketResponse } from '@rei/contracts';
import type { PlaceMarketResponse, PlaceResponse, PlacesResponse } from '@rei/contracts';
import { config } from '../config';

export class PlaceReadError extends Error {
  readonly status: number;
  constructor(status: number) {
    super('The place contract could not be read.');
    this.status = status;
  }
}

export function isPlaceId(value: string | undefined): value is string {
  return value !== undefined && value.length <= 200 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

export interface PlaceClient {
  places(signal: AbortSignal): Promise<PlacesResponse>;
  place(id: string, signal: AbortSignal): Promise<PlaceResponse>;
  market(id: string, signal: AbortSignal): Promise<PlaceMarketResponse>;
}

export function createPlaceClient(baseUrl = config.apiBaseUrl): PlaceClient {
  async function read<T>(
    path: string,
    signal: AbortSignal,
    parse: (value: unknown) => T,
  ): Promise<T> {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/v1${path}`, {
      signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new PlaceReadError(response.status);
    const value: unknown = await response.json();
    return parse(value);
  }
  function validate(id: string) {
    if (!isPlaceId(id)) throw new PlaceReadError(400);
  }
  return {
    async places(signal: AbortSignal) {
      const roots = await read('/places', signal, parsePlacesResponse);
      const pending = [...roots.items];
      const items: PlacesResponse['items'][number][] = [];
      const visited = new Set<string>();
      // The public collection contains hierarchy roots, not a flat neighborhood catalogue.
      // Walk validated children serially; do not fetch blocks or create unbounded fan-out.
      for (let index = 0; index < pending.length; index++) {
        const place = pending[index]!;
        if (visited.has(place.id)) throw new PlaceReadError(502);
        visited.add(place.id);
        if (place.kind === 'neighborhood') items.push(place);
        else if (place.kind !== 'street-block') {
          const children = await read(`/places/${place.id}/children`, signal, parsePlacesResponse);
          if (children.items.some((child) => child.parentId !== place.id))
            throw new PlaceReadError(502);
          pending.push(...children.items);
        }
      }
      return { metadata: roots.metadata, items };
    },
    async place(id: string, signal: AbortSignal) {
      validate(id);
      const result = await read(`/places/${id}`, signal, parsePlaceResponse);
      if (result.place.id !== id) throw new PlaceReadError(502);
      return result;
    },
    async market(id: string, signal: AbortSignal) {
      validate(id);
      const result = await read(`/places/${id}/market`, signal, parsePlaceMarketResponse);
      if (result.place.id !== id || result.basis !== 'event-fed-median-with-prepared-sections') {
        throw new PlaceReadError(502);
      }
      return result;
    },
  };
}
