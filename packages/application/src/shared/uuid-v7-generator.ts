import type { UuidV7 } from '@rei/domain';

import type { Transaction } from './transaction.js';

export const UUID_V7_GENERATOR = Symbol.for('rei.UuidV7Generator');

/** Generates identifiers through the persistence engine that owns their ordering guarantees. */
export interface UuidV7Generator {
  generate(transaction: Transaction): Promise<UuidV7>;
}
