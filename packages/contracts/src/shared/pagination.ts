import type { JsonCompatible } from './json.js';

/** A readonly page of results addressed by an opaque cursor. */
export interface PaginatedResponse<T> {
  readonly items: readonly JsonCompatible<T>[];
  readonly nextCursor: string | null;
  readonly totalItems: number;
}
