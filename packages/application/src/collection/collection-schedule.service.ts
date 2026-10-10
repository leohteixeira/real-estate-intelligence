import { CollectionRunRequested, collectionRunOperationKey, type TraceContext } from '@rei/domain';

import type {
  Clock,
  OutboxAppendPort,
  TransactionRunner,
  UuidV7Generator,
} from '../shared/index.js';
import type {
  ClaimedCollectionSchedule,
  CollectionScheduleRepository,
} from './collection-schedule.repository.js';

export function collectionScheduleOperationKey(sourceId: string, scheduledFor: string): string {
  return collectionRunOperationKey(sourceId, scheduledFor);
}

export class RequestDueCollectionRuns {
  public constructor(
    private readonly schedules: CollectionScheduleRepository,
    private readonly transactions: TransactionRunner,
    private readonly identifiers: UuidV7Generator,
    private readonly clock: Clock,
    private readonly outbox: OutboxAppendPort,
  ) {}

  public execute(
    limit: number,
    traceContext: TraceContext | null,
    signal: AbortSignal,
  ): Promise<readonly ClaimedCollectionSchedule[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new RangeError('Schedule claim limit must be between 1 and 100.');
    }
    signal.throwIfAborted();
    const now = this.clock.now();
    return this.transactions.runInTransaction(async (transaction) => {
      const claimed = await this.schedules.claimDue(transaction, now, limit);
      const events: CollectionRunRequested[] = [];
      for (const schedule of claimed) {
        const expectedKey = collectionScheduleOperationKey(
          schedule.sourceId,
          schedule.scheduledFor,
        );
        if (schedule.operationKey !== expectedKey) {
          throw new Error('Collection schedule repository returned a non-deterministic key.');
        }
        const eventId = await this.identifiers.generate(transaction);
        events.push(
          new CollectionRunRequested({
            eventId,
            aggregateId: eventId,
            occurredAt: now,
            traceContext,
            payload: {
              sourceId: schedule.sourceId,
              scheduledFor: schedule.scheduledFor,
              operationKey: schedule.operationKey,
            },
          }),
        );
      }
      if (events.length > 0) await this.outbox.append(transaction, events);
      return claimed;
    }, signal);
  }
}
