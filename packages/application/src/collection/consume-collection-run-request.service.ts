import { parseCollectionRunRequested } from '@rei/domain';

import type { Inbox, TransactionRunner } from '../shared/index.js';
import type { CollectSourceRun, CollectSourceRunResult } from './collect-source-run.service.js';
import type { CollectionScheduleRepository } from './collection-schedule.repository.js';

export const SCHEDULED_COLLECTION_CONSUMER = 'collection.scheduled-run';

/** Executes a durable schedule command and records success plus slot release atomically. */
export class ConsumeCollectionRunRequest {
  public constructor(
    private readonly collector: CollectSourceRun,
    private readonly schedules: CollectionScheduleRepository,
    private readonly transactions: TransactionRunner,
    private readonly inbox: Inbox,
  ) {}

  public async execute(
    untrustedEvent: unknown,
    signal: AbortSignal,
  ): Promise<CollectSourceRunResult> {
    const event = parseCollectionRunRequested(untrustedEvent);
    const result = await this.collector.execute(
      event.payload.sourceId,
      event.payload.operationKey,
      event.traceContext,
      signal,
    );
    signal.throwIfAborted();
    await this.transactions.runInTransaction(async (transaction) => {
      const firstDelivery = await this.inbox.record(
        transaction,
        SCHEDULED_COLLECTION_CONSUMER,
        event.eventId,
      );
      if (firstDelivery) {
        const cleared = await this.schedules.completeMatching(
          transaction,
          event.payload.sourceId,
          event.payload.operationKey,
        );
        if (!cleared) {
          throw new Error('The scheduled collection operation no longer owns its in-flight slot.');
        }
      }
    }, signal);
    return result;
  }
}
