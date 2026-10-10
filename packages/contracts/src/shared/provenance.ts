import type { JsonCompatible } from './json.js';

/** Evidence retained with a JSON-safe value returned by the API. */
export interface ProvenanceResponse<T> {
  readonly value: JsonCompatible<T>;
  readonly source: string;
  readonly sourceUrl: string;
  readonly collectedAt: string;
}
