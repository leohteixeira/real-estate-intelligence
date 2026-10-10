import { ExternalFailure, type ListingSource, type RawListingDocument } from '@rei/application';
import { isOwnedSyntheticSourceId, type CollectedListing } from '@rei/domain';

import { SYNTHETIC_SAO_PAULO_DATASET } from './synthetic-sao-paulo.dataset.js';
import { SyntheticListingSource } from './synthetic-listing-source.js';

const CYCLE = '2026-10';
const CURSOR = /^fixture:2026-10:(\d+)$/;

function cancelled(): ExternalFailure {
  return new ExternalFailure({ kind: 'cancelled', operation: 'collection.source.fetch-page' });
}

async function wait(delayMs: number, signal: AbortSignal): Promise<void> {
  if (delayMs === 0) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, delayMs);
    const abort = (): void => {
      clearTimeout(timer);
      reject(cancelled());
    };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}

function canonicalBytes(listing: CollectedListing): Uint8Array {
  return Uint8Array.from(Buffer.from(JSON.stringify(listing), 'utf8'));
}

/** Latest-cycle, one-observation-per-page fixture adapter. It performs no network I/O. */
export class SyntheticSaoPauloListingSource implements ListingSource {
  readonly #parser = new SyntheticListingSource();

  public constructor(private readonly delayMs = 0) {
    if (!Number.isSafeInteger(delayMs) || delayMs < 0 || delayMs > 30_000) {
      throw new RangeError('Synthetic page delay must be an integer between 0 and 30000ms.');
    }
  }

  public async fetchPage(sourceId: string, cursor: string | null, signal: AbortSignal) {
    if (signal.aborted) throw cancelled();
    if (!isOwnedSyntheticSourceId(sourceId) || sourceId === 'synthetic-data') {
      throw new ExternalFailure({ kind: 'forbidden', operation: 'collection.source.fetch-page' });
    }
    const match = cursor === null ? null : CURSOR.exec(cursor);
    if (cursor !== null && match === null) {
      throw new ExternalFailure({ kind: 'rejected', operation: 'collection.source.fetch-page' });
    }
    const index = match === null ? 0 : Number(match[1]);
    const run = SYNTHETIC_SAO_PAULO_DATASET.runs.find(({ runKey }) => runKey === CYCLE);
    if (!run) throw new Error('The latest synthetic dataset cycle is missing.');
    const observations = run.observations
      .filter((observation) => observation.sourceId === sourceId)
      .sort((left, right) => left.sourceListingId.localeCompare(right.sourceListingId));
    if (!Number.isSafeInteger(index) || index < 0 || index > observations.length) {
      throw new ExternalFailure({ kind: 'rejected', operation: 'collection.source.fetch-page' });
    }
    await wait(this.delayMs, signal);
    if (index === observations.length) {
      return Object.freeze({ documents: Object.freeze([]), nextCursor: cursor, exhausted: true });
    }
    const observation = observations[index]!;
    const document: RawListingDocument = Object.freeze({
      sourceId: observation.sourceId,
      sourceListingId: observation.sourceListingId,
      sourceUrl: observation.sourceUrl,
      observedAt: observation.observedAt,
      mediaType: 'application/json',
      bytes: canonicalBytes(observation.listing),
    });
    const exhausted = index + 1 === observations.length;
    return Object.freeze({
      documents: Object.freeze([document]),
      nextCursor: `fixture:${CYCLE}:${index + 1}`,
      exhausted,
    });
  }

  public parse(document: RawListingDocument, signal: AbortSignal): Promise<CollectedListing> {
    return this.#parser.parse(document, signal);
  }
}
