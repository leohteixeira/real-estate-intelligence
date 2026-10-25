import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { context } from '@opentelemetry/api';
import { suppressTracing } from '@opentelemetry/core';
import {
  ExternalFailure,
  ListingSourceAccessRefusal,
  type ImageFingerprintComputer,
} from '@rei/application';
import { MAX_PHOTO_BYTES } from './sharp-image-fingerprint.js';

/** Exact configured origins only; one request, no redirect, retry, disk or cache. */
export class HttpListingPhoto {
  private readonly origins: ReadonlySet<string>;
  public constructor(
    origins: readonly string[],
    private readonly computer: ImageFingerprintComputer,
  ) {
    this.origins = new Set(
      origins.map((origin) => {
        const url = new URL(origin);
        if (
          !['http:', 'https:'].includes(url.protocol) ||
          url.username ||
          url.password ||
          url.origin !== origin
        )
          throw new TypeError('Expected explicit photo origins.');
        return origin;
      }),
    );
  }

  public async fingerprintPhoto(
    _sourceId: string,
    photoUrl: string,
    signal: AbortSignal,
  ): Promise<string> {
    let url: URL;
    try {
      url = new URL(photoUrl);
      if (!this.origins.has(url.origin) || url.username || url.password || url.hash)
        throw new TypeError('Unapproved origin.');
    } catch {
      throw new ExternalFailure({ kind: 'forbidden', operation: 'collection.source.photo' });
    }
    try {
      signal.throwIfAborted();
      // HTTP auto-instrumentation exports full URLs; photographs must stay transient.
      const bytes = await context.with(
        suppressTracing(context.active()),
        () =>
          new Promise<Uint8Array>((resolve, reject) => {
            const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
              url,
              { signal, headers: { accept: 'image/jpeg, image/png, image/webp' } },
              (response) => {
                const status = response.statusCode ?? 0;
                const fail = (error: ExternalFailure) => {
                  response.destroy();
                  reject(error);
                };
                if (status === 401 || status === 403)
                  return fail(new ListingSourceAccessRefusal('access-denied'));
                if (status === 429 || status >= 500) {
                  const retryAfter = response.headers['retry-after'];
                  const delay =
                    typeof retryAfter === 'string'
                      ? /^\d+$/.test(retryAfter)
                        ? Number(retryAfter) * 1_000
                        : Date.parse(retryAfter) - Date.now()
                      : NaN;
                  return fail(
                    new ExternalFailure({
                      kind: 'transient',
                      operation: 'collection.source.photo',
                      ...(Number.isFinite(delay) ? { retryAfterMs: Math.max(0, delay) } : {}),
                    }),
                  );
                }
                if (
                  status !== 200 ||
                  !['image/jpeg', 'image/png', 'image/webp'].includes(
                    response.headers['content-type']?.split(';')[0]?.trim() ?? '',
                  ) ||
                  Number(response.headers['content-length'] ?? 0) > MAX_PHOTO_BYTES
                )
                  return fail(
                    new ExternalFailure({ kind: 'rejected', operation: 'collection.source.photo' }),
                  );
                const chunks: Uint8Array[] = [];
                let length = 0;
                response.on('data', (chunk: Buffer) => {
                  length += chunk.byteLength;
                  if (length > MAX_PHOTO_BYTES)
                    return fail(
                      new ExternalFailure({
                        kind: 'rejected',
                        operation: 'collection.source.photo',
                      }),
                    );
                  chunks.push(chunk);
                });
                response.once('error', reject);
                response.once('end', () => resolve(Buffer.concat(chunks, length)));
              },
            );
            request.once('error', reject);
            request.end();
          }),
      );
      return await this.computer.compute(bytes, signal);
    } catch (error) {
      if (signal.aborted)
        throw new ExternalFailure({ kind: 'cancelled', operation: 'collection.source.photo' });
      if (error instanceof ExternalFailure) throw error;
      throw new ExternalFailure({ kind: 'transient', operation: 'collection.source.photo' });
    }
  }
}
