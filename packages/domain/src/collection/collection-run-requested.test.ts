import { describe, expect, it } from 'vitest';

import {
  CollectionRunRequested,
  collectionRunOperationKey,
  parseCollectionRunRequested,
} from './index.js';

const EVENT_ID = '0199c8f2-2394-7ba0-8f9e-286378779219';
const SOURCE_ID = 'synthetic-portal-aurora';
const SCHEDULED_FOR = '2026-10-10T15:30:00.000Z';
const OPERATION_KEY = `collection:${SOURCE_ID}:${SCHEDULED_FOR}`;

function request(operationKey = OPERATION_KEY): unknown {
  return {
    eventId: EVENT_ID,
    type: 'collection.run.requested',
    version: 1,
    aggregateId: EVENT_ID,
    occurredAt: SCHEDULED_FOR,
    traceContext: null,
    payload: { sourceId: SOURCE_ID, scheduledFor: SCHEDULED_FOR, operationKey },
  };
}

describe('CollectionRunRequested', () => {
  it('derives the operation key from the source and canonical UTC instant', () => {
    expect(collectionRunOperationKey(SOURCE_ID, '2026-10-10T12:30:00-03:00')).toBe(OPERATION_KEY);
    expect(parseCollectionRunRequested(request()).payload).toEqual({
      sourceId: SOURCE_ID,
      scheduledFor: SCHEDULED_FOR,
      operationKey: OPERATION_KEY,
    });
  });

  it('rejects a mismatched key through both construction and wire parsing', () => {
    const mismatchedKey = 'collection:synthetic-portal-brisa:2026-10-10T15:30:00.000Z';
    expect(() => parseCollectionRunRequested(request(mismatchedKey))).toThrow(
      'must match the source and scheduled UTC instant',
    );
    expect(
      () =>
        new CollectionRunRequested({
          eventId: EVENT_ID,
          aggregateId: EVENT_ID,
          occurredAt: SCHEDULED_FOR,
          traceContext: null,
          payload: {
            sourceId: SOURCE_ID,
            scheduledFor: SCHEDULED_FOR,
            operationKey: mismatchedKey,
          },
        }),
    ).toThrow('must match the source and scheduled UTC instant');
  });
});
