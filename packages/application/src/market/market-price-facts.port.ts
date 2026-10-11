import type { ListingFact, PropertiesEvent } from '@rei/domain';
import type { Transaction } from '../shared/index.js';

export const MARKET_PRICE_FACTS = Symbol.for('rei.MarketPriceFacts');
export const MARKET_LISTING_EVENT_TYPES = [
  'properties.listing.created',
  'properties.listing.price-changed',
  'properties.listing.description-changed',
  'properties.listing.removed',
  'properties.listing.reappeared',
] as const;
export type MarketListingEvent = PropertiesEvent<(typeof MARKET_LISTING_EVENT_TYPES)[number]>;
export interface MarketPriceFactsReadPort {
  /** One coherent detached snapshot of all current listings, before geography selection. */
  readCurrent(): Promise<readonly ListingFact[]>;
}
export interface MarketPriceFactsProjectionPort {
  /** Validate permanent identity/revision fences even if the inbox already contains the event.
   * Append immutable evidence and advance only a higher revision, inside this transaction.
   */
  project(transaction: Transaction, event: MarketListingEvent): Promise<void>;
}
