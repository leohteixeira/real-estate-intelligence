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
