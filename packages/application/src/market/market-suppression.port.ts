import type { CollectionListingSuppressed, PropertiesListingSuppressed } from '@rei/domain';
import type { Transaction } from '../shared/index.js';
export type MarketSuppressionEvent = CollectionListingSuppressed | PropertiesListingSuppressed;
export interface MarketSuppressionPort {
  /** Caller authenticates the cause before this operation takes the Market writer lock. */
  erase(transaction: Transaction, event: MarketSuppressionEvent): Promise<void>;
}
