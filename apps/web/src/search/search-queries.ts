import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import type { SearchQuery } from '@rei/contracts';
import { readPolicy } from '../places/place-queries';
import { createSearchClient } from './search-client';
import { diagnoseEmpty } from './search-diagnostics';

const client = createSearchClient();
export const searchQuery = (query: SearchQuery) =>
  queryOptions({
    ...readPolicy,
    queryKey: ['search', query],
    queryFn: ({ signal }) => client.search(query, signal),
  });
export const resultsQuery = (query: SearchQuery) =>
  infiniteQueryOptions({
    ...readPolicy,
    // Pagination belongs to this visit; returning to old inputs starts at the first page.
    gcTime: 0,
    queryKey: ['search-pages', query],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ signal, pageParam }) =>
      client.search({ ...query, ...(pageParam ? { cursor: pageParam } : {}) }, signal),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
export const hierarchyQuery = () =>
  queryOptions({
    ...readPolicy,
    queryKey: ['search-hierarchy'],
    queryFn: ({ signal }) => client.hierarchy(signal),
  });
export const diagnosticQuery = (query: SearchQuery) =>
  queryOptions({
    ...readPolicy,
    queryKey: ['search-diagnostic', query],
    queryFn: ({ signal }) => diagnoseEmpty(query, (prefix) => client.search(prefix, signal)),
  });
