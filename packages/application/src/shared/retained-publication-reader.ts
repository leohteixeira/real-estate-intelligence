import type { EventEnvelope } from './outbox.js';
import type { Transaction } from './transaction.js';

export const RETAINED_PUBLICATION_READER = Symbol.for('rei.RetainedPublicationReader');

/** Bounded transaction-scoped access to authentic publications still retained by the platform. */
export interface RetainedPublicationReader {
  find(
    transaction: Transaction,
    aggregateId: string,
    eventType: string,
  ): Promise<EventEnvelope | null>;
}
