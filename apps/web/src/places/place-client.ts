import {
  parsePlaceResponse,
  parsePlacesResponse,
  parsePlaceMarketResponse,
  parsePlaceMarketNeighboursResponse,
  parsePlaceMarketSeriesResponse,
  parseReductionsResponse,
  parsePropertyResponse,
  parseListingResponse,
} from '@rei/contracts';
import type {
  PlaceMarketResponse,
  PlaceResponse,
  PlacesResponse,
  PlaceMarketNeighboursResponse,
  PlaceMarketSeriesResponse,
  ReductionsResponse,
  PropertyResponse,
  ListingResponse,
} from '@rei/contracts';
import { config } from '../config';
import { ApiReadError, createApiClient } from '../api/client';

export class PlaceReadError extends ApiReadError {
  constructor(status: number, requestId?: string) {
    super(status, 'The place contract could not be read.', requestId);
  }
}

export function isPlaceId(value: string | undefined): value is string {
  return value !== undefined && value.length <= 200 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

export interface PlaceClient {
  places(signal: AbortSignal): Promise<PlacesResponse>;
  place(id: string, signal: AbortSignal): Promise<PlaceResponse>;
  market(id: string, signal: AbortSignal): Promise<PlaceMarketResponse>;
  neighbours(id: string, signal: AbortSignal): Promise<PlaceMarketNeighboursResponse>;
  series(id: string, signal: AbortSignal): Promise<PlaceMarketSeriesResponse>;
  reductions(id: string, signal: AbortSignal): Promise<ReductionsResponse>;
  property(id: string, signal: AbortSignal): Promise<PropertyResponse>;
  listing(id: string, signal: AbortSignal): Promise<ListingResponse>;
}

export function createPlaceClient(baseUrl = config.apiBaseUrl): PlaceClient {
  const transport = createApiClient(baseUrl);
  async function read<T>(
    path: `/${string}`,
    signal: AbortSignal,
    parse: (value: unknown) => T,
  ): Promise<T> {
    try {
      return await transport.read(path, signal, parse);
    } catch (error) {
      if (error instanceof ApiReadError) throw new PlaceReadError(error.status, error.requestId);
      throw error;
    }
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
      if (
        result.place.id !== id ||
        (result.basis !== 'event-fed-median-with-prepared-sections' &&
          result.basis !== 'event-fed-figures-with-prepared-counts' &&
          result.basis !== 'event-fed-place-figures')
      ) {
        throw new PlaceReadError(502);
      }
      return result;
    },
    async neighbours(id: string, signal: AbortSignal) {
      validate(id);
      const result = await read(
        `/places/${id}/market/neighbours`,
        signal,
        parsePlaceMarketNeighboursResponse,
      );
      if (result.place.id !== id) throw new PlaceReadError(502);
      return result;
    },
    async series(id: string, signal: AbortSignal) {
      validate(id);
      const result = await read(
        `/places/${id}/market/monthly-series`,
        signal,
        parsePlaceMarketSeriesResponse,
      );
      if (result.place.id !== id) throw new PlaceReadError(502);
      return result;
    },
    async reductions(id: string, signal: AbortSignal) {
      validate(id);
      const result = await read(
        `/places/${id}/largest-reductions?pageSize=3`,
        signal,
        parseReductionsResponse,
      );
      if (result.items.length > 3) throw new PlaceReadError(502);
      return result;
    },
    async property(id: string, signal: AbortSignal) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
        throw new PlaceReadError(400);
      const result = await read(`/properties/${id}`, signal, parsePropertyResponse);
      if (result.property.summary.id !== id) throw new PlaceReadError(502);
      return result;
    },
    async listing(id: string, signal: AbortSignal) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
        throw new PlaceReadError(400);
      const result = await read(`/listings/${id}`, signal, parseListingResponse);
      if (result.listing.id !== id) throw new PlaceReadError(502);
      return result;
    },
  };
}
