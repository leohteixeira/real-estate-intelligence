import {
  PROPERTIES_EVENT_TYPES,
  type ListingFact,
  type PropertiesEvent,
  type PropertiesEventV2,
  type PropertiesEventType,
} from '@rei/domain';
import type { Transaction } from '../shared/index.js';

export const MARKET_PRICE_FACTS = Symbol.for('rei.MarketPriceFacts');
export const MARKET_LISTING_EVENT_TYPES = PROPERTIES_EVENT_TYPES;
export type MarketListingEvent = PropertiesEvent<
  Extract<PropertiesEventType, `properties.listing.${string}`>
>;
export type MarketPriceFactsEvent = MarketListingEvent | PropertiesEventV2;
export interface MarketPriceFactsReadPort {
  /** One coherent detached snapshot of global active property representatives, before eligibility. */
  readCurrent(): Promise<readonly ListingFact[]>;
}
export interface MarketPriceFactsProjectionPort {
  /** Validate permanent identity/revision fences even if the inbox already contains the event.
   * Append immutable evidence and advance state/membership independently inside this transaction.
   */
  project(transaction: Transaction, event: MarketPriceFactsEvent): Promise<void>;
}
