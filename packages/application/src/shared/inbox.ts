import type { UuidV7 } from '@rei/domain';

import type { Transaction } from './transaction.js';

export const INBOX = Symbol.for('rei.Inbox');
export const INBOX_RETENTION_PORT = Symbol.for('rei.InboxRetentionPort');

/** Records a delivery in the transaction that owns its consumer effect. */
export interface Inbox {
  /** Returns true for the first delivery and false when this consumer already recorded the event. */
  record(transaction: Transaction, consumerName: string, eventId: UuidV7): Promise<boolean>;
}

/** Bounded maintenance capability for completed delivery markers. */
export interface InboxRetentionPort {
  pruneConsumed(retentionMs: number, batchSize: number, signal: AbortSignal): Promise<number>;
}
