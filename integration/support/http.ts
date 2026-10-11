import type { Response } from 'supertest';
import request from 'supertest';

export interface HttpOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD';
  headers?: Record<string, string>;
  body?: string | object;
  signal?: AbortSignal;
}

// Keep literal malformed paths and query strings intact for parser/error campaigns.
export async function requestHttp(
  url: string | URL,
  { method = 'GET', headers = {}, body, signal }: HttpOptions = {},
) {
  const match = /^(https?:\/\/[^/]+)(.*)$/.exec(String(url));
  if (!match) throw new TypeError('Integration HTTP requests require an absolute HTTP URL.');
  const client = request(match[1]!);
  const methods = {
    GET: client.get,
    POST: client.post,
    PUT: client.put,
    DELETE: client.delete,
    PATCH: client.patch,
    HEAD: client.head,
  };
  const pending = methods[method]
    .call(client, match[2] || '/')
    .set(headers)
    .ok(() => true)
    .timeout({ response: 15_000, deadline: 30_000 });
  if (body !== undefined) pending.send(body);
  signal?.throwIfAborted();
  let abort: (() => void) | undefined;
  try {
    const response = await new Promise<Response>((resolve, reject) => {
      abort = () => {
        pending.abort();
        reject(signal?.reason);
      };
      signal?.addEventListener('abort', abort, { once: true });
      pending.end((error, response) => (error ? reject(error) : resolve(response)));
    });
    return {
      status: response.status,
      ok: response.status >= 200 && response.status < 300,
      headers: new Headers(response.headers as Record<string, string>),
      json: async (): Promise<unknown> => response.body,
      text: async () => response.text,
      arrayBuffer: async (): Promise<unknown> => response.body,
    };
  } finally {
    if (abort) signal?.removeEventListener('abort', abort);
  }
}
