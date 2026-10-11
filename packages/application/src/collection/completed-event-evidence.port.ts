import type { CollectionRunCompleted } from '@rei/domain';
import type { Transaction } from '../shared/index.js';

export interface CompletedEventEvidence {
  appendCompletedEvidence(transaction: Transaction, event: CollectionRunCompleted): Promise<void>;
}
