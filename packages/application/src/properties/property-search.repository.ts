import type { FixtureMetadata, PropertySummary } from '@rei/domain';

export const PROPERTY_SEARCH = Symbol.for('rei.PropertySearch');
export interface PropertySearchRepository {
  readCurrent(): Promise<
    readonly { readonly summary: PropertySummary; readonly asOf: FixtureMetadata['asOf'] }[]
  >;
}
