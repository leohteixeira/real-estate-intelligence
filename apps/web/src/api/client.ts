import { config } from '../config';

export class ApiReadError extends Error {
  readonly status: number;
  constructor(status: number, message = 'The public contract could not be read.') {
    super(message);
    this.status = status;
    this.name = 'ApiReadError';
  }
}

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
      if (!response.ok) throw new ApiReadError(response.status);
      try {
        const value: unknown = await response.json();
        return parse(value);
      } catch (error) {
        if (signal.aborted) throw error;
        throw new ApiReadError(502);
      }
    },
  };
}
