import { config } from '../config';
import { ApiReadError, publicRequestId } from './read-error.js';
export { ApiReadError, publicRequestId } from './read-error.js';

export function createApiClient(baseUrl = config.apiBaseUrl) {
  return {
    async read<T>(
      path: `/${string}`,
      signal: AbortSignal,
      parse: (value: unknown) => T,
    ): Promise<T> {
      let response: Response;
      try {
        response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/v1${path}`, {
          signal,
          headers: { Accept: 'application/json' },
        });
      } catch (error) {
        if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError'))
          throw error;
        throw new ApiReadError(0);
      }
      const requestId = publicRequestId(response.headers.get('x-request-id'));
      if (!response.ok) throw new ApiReadError(response.status, undefined, requestId);
      try {
        const value: unknown = await response.json();
        return parse(value);
      } catch (error) {
        if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError'))
          throw error;
        throw new ApiReadError(502, undefined, requestId);
      }
    },
  };
}
