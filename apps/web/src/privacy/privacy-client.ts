import { parseEnabledSourcesResponse } from '@rei/contracts';
import { ApiReadError, createApiClient } from '../api/client';
import { readPolicy } from '../places/place-queries';
import { queryOptions } from '@tanstack/react-query';

export function createPrivacyClient(baseUrl?: string) {
  const transport = createApiClient(baseUrl);
  return {
    async sources(signal: AbortSignal) {
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
          reject(new ApiReadError(0));
          request.abort();
        }, 10_000);
      });
      try {
        return await Promise.race([
          transport.read('/collection/sources', request.signal, parseEnabledSourcesResponse),
          interrupted,
        ]);
      } finally {
        clearTimeout(deadline);
        signal.removeEventListener('abort', cancel);
      }
    },
  };
}

const client = createPrivacyClient();
export const privacySourcesQuery = () =>
  queryOptions({
    ...readPolicy,
    queryKey: ['privacy', 'enabled-sources'],
    queryFn: ({ signal }) => client.sources(signal),
  });
