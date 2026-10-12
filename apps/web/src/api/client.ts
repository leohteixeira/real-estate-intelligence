import { config } from '../config';

export function publicRequestId(value: string | null | undefined): string | undefined {
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? value
    : undefined;
}

export class ApiReadError extends Error {
  readonly status: number;
  readonly requestId: string | undefined;
  constructor(
    status: number,
    message = 'The public contract could not be read.',
    requestId?: string,
  ) {
    super(message);
    this.status = status;
    this.name = 'ApiReadError';
    this.requestId = publicRequestId(requestId);
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
