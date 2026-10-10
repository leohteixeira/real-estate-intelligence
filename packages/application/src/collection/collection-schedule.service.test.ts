import { CollectionRunRequested, type UuidV7 } from '@rei/domain';
import { describe, expect, it, vi } from 'vitest';

import type {
  Clock,
  Inbox,
  OutboxAppendPort,
  Transaction,
  TransactionRunner,
  UuidV7Generator,
} from '../shared/index.js';
import type { CollectSourceRun } from './collect-source-run.service.js';
import type { CollectionScheduleRepository } from './collection-schedule.repository.js';
import {
  collectionScheduleOperationKey,
  RequestDueCollectionRuns,
} from './collection-schedule.service.js';
import {
  ConsumeCollectionRunRequest,
  SCHEDULED_COLLECTION_CONSUMER,
} from './consume-collection-run-request.service.js';

const EVENT_ID = '0199c8f2-2394-7ba0-8f9e-286378779210' as UuidV7;
const RUN_ID = '0199c8f2-2394-7ba0-8f9e-286378779211' as UuidV7;
const COMPLETED_EVENT_ID = '0199c8f2-2394-7ba0-8f9e-286378779212' as UuidV7;
const SCHEDULED_FOR = '2026-10-10T12:00:00.000Z';
const SOURCE_ID = 'synthetic-portal-aurora';
const OPERATION_KEY = `collection:${SOURCE_ID}:${SCHEDULED_FOR}`;
const transaction = {} as Transaction;

function transactions(): TransactionRunner {
  return {
    runInTransaction: vi.fn(async (work) => work(transaction)),
  };
}

function requestEvent(): unknown {
  return JSON.parse(
    JSON.stringify(
      new CollectionRunRequested({
        eventId: EVENT_ID,
        aggregateId: EVENT_ID,
        occurredAt: SCHEDULED_FOR,
        traceContext: null,
        payload: { sourceId: SOURCE_ID, scheduledFor: SCHEDULED_FOR, operationKey: OPERATION_KEY },
      }),
    ),
  ) as unknown;
}

describe('scheduled collection orchestration', () => {
  it('derives a stable operation key and appends claimed requests in the claim transaction', async () => {
    const claimed = {
      scheduleId: '0199c8f2-2394-7ba0-8f9e-286378779299',
      sourceId: SOURCE_ID,
      scheduledFor: SCHEDULED_FOR,
      operationKey: OPERATION_KEY,
      nextRunAt: '2026-10-10T13:00:00.000Z',
    };
    const schedules: CollectionScheduleRepository = {
      claimDue: vi.fn(async () => [claimed]),
      completeMatching: vi.fn(),
    };
    const outbox: OutboxAppendPort = { append: vi.fn() };
    const service = new RequestDueCollectionRuns(
      schedules,
      transactions(),
      { generate: vi.fn(async () => EVENT_ID) } as UuidV7Generator,
      { now: vi.fn(() => SCHEDULED_FOR) } as Clock,
      outbox,
    );

    await expect(service.execute(10, null, new AbortController().signal)).resolves.toEqual([
      claimed,
    ]);
    expect(collectionScheduleOperationKey(SOURCE_ID, SCHEDULED_FOR)).toBe(OPERATION_KEY);
    expect(outbox.append).toHaveBeenCalledWith(transaction, [
      expect.objectContaining({
        type: 'collection.run.requested',
        aggregateId: EVENT_ID,
        payload: expect.objectContaining({ operationKey: OPERATION_KEY }),
      }),
    ]);
  });

  it('rejects a repository key that is not derived from the source and scheduled instant', async () => {
    const schedules: CollectionScheduleRepository = {
      claimDue: vi.fn(async () => [
        {
          scheduleId: EVENT_ID,
          sourceId: SOURCE_ID,
          scheduledFor: SCHEDULED_FOR,
          operationKey: 'collection:wrong:2026-10-10T12:00:00.000Z',
          nextRunAt: '2026-10-10T13:00:00.000Z',
        },
      ]),
      completeMatching: vi.fn(),
    };
    const service = new RequestDueCollectionRuns(
      schedules,
      transactions(),
      { generate: vi.fn(async () => EVENT_ID) },
      { now: vi.fn(() => SCHEDULED_FOR) },
      { append: vi.fn() },
    );

    await expect(service.execute(1, null, new AbortController().signal)).rejects.toThrow(
      'non-deterministic key',
    );
  });

  it('records inbox success and clears only the matching in-flight slot atomically', async () => {
    const result = {
      operationKey: OPERATION_KEY,
      runId: RUN_ID,
      sourceId: SOURCE_ID,
      observedCount: 3,
      parsedCount: 3,
      changedCount: 0,
      failedCount: 0,
      manifestHash: `sha256:${'1'.repeat(64)}`,
      completedEventId: COMPLETED_EVENT_ID,
      completedAt: SCHEDULED_FOR,
      replayed: false,
    } as const;
    const collector = { execute: vi.fn(async () => result) } as unknown as CollectSourceRun;
    const schedules: CollectionScheduleRepository = {
      claimDue: vi.fn(),
      completeMatching: vi.fn(async () => true),
    };
    const inbox: Inbox = { record: vi.fn(async () => true) };
    const service = new ConsumeCollectionRunRequest(collector, schedules, transactions(), inbox);

    await expect(service.execute(requestEvent(), new AbortController().signal)).resolves.toBe(
      result,
    );
    expect(inbox.record).toHaveBeenCalledWith(transaction, SCHEDULED_COLLECTION_CONSUMER, EVENT_ID);
    expect(schedules.completeMatching).toHaveBeenCalledWith(transaction, SOURCE_ID, OPERATION_KEY);
  });

  it('does not record or clear a slot when collection fails', async () => {
    const failure = new Error('collection failed');
    const collector = {
      execute: vi.fn(async () => Promise.reject(failure)),
    } as unknown as CollectSourceRun;
    const schedules: CollectionScheduleRepository = {
      claimDue: vi.fn(),
      completeMatching: vi.fn(),
    };
    const inbox: Inbox = { record: vi.fn() };
    const service = new ConsumeCollectionRunRequest(collector, schedules, transactions(), inbox);

    await expect(service.execute(requestEvent(), new AbortController().signal)).rejects.toBe(
      failure,
    );
    expect(inbox.record).not.toHaveBeenCalled();
    expect(schedules.completeMatching).not.toHaveBeenCalled();
  });

  it('rejects a non-canonical request key before collection or transaction effects', async () => {
    const event = requestEvent() as {
      payload: { operationKey: string };
    };
    event.payload.operationKey = 'collection:synthetic-portal-brisa:2026-10-10T12:00:00.000Z';
    const collector = { execute: vi.fn() } as unknown as CollectSourceRun;
    const schedules: CollectionScheduleRepository = {
      claimDue: vi.fn(),
      completeMatching: vi.fn(),
    };
    const transactionRunner = transactions();
    const inbox: Inbox = { record: vi.fn() };
    const service = new ConsumeCollectionRunRequest(collector, schedules, transactionRunner, inbox);

    await expect(service.execute(event, new AbortController().signal)).rejects.toThrow(
      'must match the source and scheduled UTC instant',
    );
    expect(collector.execute).not.toHaveBeenCalled();
    expect(transactionRunner.runInTransaction).not.toHaveBeenCalled();
    expect(inbox.record).not.toHaveBeenCalled();
    expect(schedules.completeMatching).not.toHaveBeenCalled();
  });
});
