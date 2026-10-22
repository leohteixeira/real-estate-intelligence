import { QueryClient, queryOptions } from '@tanstack/react-query';
import { createPlaceClient } from './place-client';

const client = createPlaceClient();
export const readPolicy = {
  retry: false,
  staleTime: 30_000,
  gcTime: 300_000,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
} as const;

export function createReadCache() {
  return new QueryClient({ defaultOptions: { queries: readPolicy, mutations: { retry: false } } });
}

export const placesQuery = () =>
  queryOptions({
    ...readPolicy,
    queryKey: ['places'],
    queryFn: ({ signal }) => client.places(signal),
  });
export const placeQuery = (id: string) =>
  queryOptions({
    ...readPolicy,
    queryKey: ['place', id],
    queryFn: ({ signal }) => client.place(id, signal),
  });
export const marketQuery = (id: string) =>
  queryOptions({
    ...readPolicy,
    queryKey: ['place', id, 'market'],
    queryFn: ({ signal }) => client.market(id, signal),
  });

export const neighboursQuery = (id: string) =>
  queryOptions({
    ...readPolicy,
    queryKey: ['place', id, 'neighbours'],
    queryFn: ({ signal }) => client.neighbours(id, signal),
  });
export const seriesQuery = (id: string) =>
  queryOptions({
    ...readPolicy,
    queryKey: ['place', id, 'series'],
    queryFn: ({ signal }) => client.series(id, signal),
  });
export const reductionsQuery = (id: string) =>
  queryOptions({
    ...readPolicy,
    queryKey: ['place', id, 'reductions'],
    queryFn: ({ signal }) => client.reductions(id, signal),
  });
export const propertyQuery = (placeOrPropertyId: string, suppliedPropertyId?: string) =>
  queryOptions({
    ...readPolicy,
    queryKey: ['property', suppliedPropertyId ?? placeOrPropertyId],
    queryFn: ({ signal }) => client.property(suppliedPropertyId ?? placeOrPropertyId, signal),
  });
