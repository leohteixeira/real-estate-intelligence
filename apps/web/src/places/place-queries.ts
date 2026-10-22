import { QueryClient, queryOptions } from '@tanstack/react-query';
import type { QueryFunctionContext } from '@tanstack/react-query';
import { createPlaceClient, PlaceReadError } from './place-client';

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

export const listingQuery = (id: string) =>
  queryOptions({
    ...readPolicy,
    queryKey: ['listing', id],
    queryFn: ({ signal }) => client.listing(id, signal),
  });

async function readListingProperty({
  queryKey: [, id],
  signal,
}: QueryFunctionContext<readonly ['listing-property-context', string]>) {
  signal.throwIfAborted();
  const request = new AbortController();
  let cancel: () => void = () => undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const interrupted = new Promise<never>((_resolve, reject) => {
    cancel = () => {
      reject(signal.reason);
      request.abort(signal.reason);
    };
    signal.addEventListener('abort', cancel, { once: true });
    deadline = setTimeout(() => {
      reject(new PlaceReadError(0));
      request.abort();
    }, 10_000);
  });
  try {
    // Race the whole parsed read: the deadline also covers a stalled response body.
    return await Promise.race([client.property(id, request.signal), interrupted]);
  } finally {
    clearTimeout(deadline);
    signal.removeEventListener('abort', cancel);
  }
}

export const listingPropertyQuery = (id: string) =>
  queryOptions({
    ...readPolicy,
    queryKey: ['listing-property-context', id] as const,
    queryFn: readListingProperty,
  });
