import type { Transaction } from '../shared/index.js';

export const COLLECTION_SCHEDULE_REPOSITORY = Symbol.for('rei.CollectionScheduleRepository');

export interface ClaimedCollectionSchedule {
  readonly scheduleId: string;
  readonly sourceId: string;
  readonly scheduledFor: string;
  readonly operationKey: string;
  readonly nextRunAt: string;
}

export interface CollectionScheduleRepository {
  /** Claims due slots, advances each schedule beyond `now`, and leaves its operation in flight. */
  claimDue(
    transaction: Transaction,
    now: string,
    limit: number,
  ): Promise<readonly ClaimedCollectionSchedule[]>;
  /** Clears only the in-flight operation owned by the successful delivery. */
  completeMatching(
    transaction: Transaction,
    sourceId: string,
    operationKey: string,
  ): Promise<boolean>;
}
