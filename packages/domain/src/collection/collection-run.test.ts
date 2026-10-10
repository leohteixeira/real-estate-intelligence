import { describe, expect, it } from 'vitest';

import type { Sha256Hash } from './sha256-hash.js';
import {
  StaleCollectionCheckpointError,
  advanceCollectionRun,
  createRunningCollectionRun,
  hydrateCollectionRun,
  parseCollectionCheckpointCursor,
  pauseCollectionRun,
  resumeCollectionRun,
} from './collection-run.js';

const RUN_ID = '0199c8f2-2394-7ba0-8f9e-286378779210' as const;
const COMPLETED_EVENT_ID = '0199c8f2-2394-7ba0-8f9e-286378779211' as const;
const MANIFEST = `sha256:${'a'.repeat(64)}` as Sha256Hash;

function running() {
  return createRunningCollectionRun({
    operationKey: 'operation-1',
    runId: RUN_ID,
    sourceId: 'synthetic-portal-aurora',
    startedAt: '2026-10-10T00:00:00.000Z',
  });
}

describe('collection run', () => {
  it('pauses at the committed prefix and resumes explicitly without terminal fields', () => {
    const prefix = advanceCollectionRun(running(), {
      expectedOrdinal: 0,
      expectedCursor: null,
      nextCursor: 'page:1',
      checkpointedAt: '2026-10-10T00:00:01.000Z',
      observedDelta: 1,
      exhausted: false,
    });
    const paused = pauseCollectionRun(prefix, {
      reason: 'captcha',
      heldAt: '2026-10-10T00:00:02.000Z',
    });
    expect(paused).toMatchObject({
      status: 'paused',
      checkpoint: prefix.checkpoint,
      counts: prefix.counts,
      completedAt: null,
      completedEventId: null,
      manifestHash: null,
    });
    expect(resumeCollectionRun(paused)).toEqual(prefix);
    expect(() =>
      hydrateCollectionRun({ ...paused, completedAt: '2026-10-10T00:00:03.000Z' }),
    ).toThrow('terminal');
    expect(() => hydrateCollectionRun({ ...paused, pause: null })).toThrow('pause reason');
    expect(() => resumeCollectionRun(prefix)).toThrow('explicitly');
  });
  it('creates an immutable zero checkpoint running state', () => {
    const run = running();
    expect(run).toMatchObject({
      status: 'running',
      checkpoint: { ordinal: 0, cursor: null, checkpointedAt: null },
      counts: { observed: 0, parsed: 0, suppressed: 0, failed: 0 },
      completedAt: null,
    });
    expect(Object.isFrozen(run)).toBe(true);
    expect(Object.isFrozen(run.checkpoint)).toBe(true);
  });

  it('advances exactly one ordinal and completes an empty terminal page', () => {
    const first = advanceCollectionRun(running(), {
      expectedOrdinal: 0,
      expectedCursor: null,
      nextCursor: 'fixture:2026-10:1',
      checkpointedAt: '2026-10-10T00:00:01.000Z',
      observedDelta: 1,
      exhausted: false,
    });
    expect(first).toMatchObject({
      status: 'running',
      checkpoint: { ordinal: 1, cursor: 'fixture:2026-10:1' },
      counts: { observed: 1, parsed: 1 },
    });

    const completed = advanceCollectionRun(running(), {
      expectedOrdinal: 0,
      expectedCursor: null,
      nextCursor: null,
      checkpointedAt: '2026-10-10T00:00:01.000Z',
      observedDelta: 0,
      exhausted: true,
      completedAt: '2026-10-10T00:00:01.000Z',
      manifestHash: MANIFEST,
      completedEventId: COMPLETED_EVENT_ID,
    });
    expect(completed).toMatchObject({ status: 'completed', counts: { observed: 0, parsed: 0 } });
    expect(() =>
      advanceCollectionRun(completed, {
        expectedOrdinal: 1,
        expectedCursor: null,
        nextCursor: null,
        checkpointedAt: '2026-10-10T00:00:02.000Z',
        observedDelta: 0,
        exhausted: true,
        completedAt: '2026-10-10T00:00:02.000Z',
        manifestHash: MANIFEST,
        completedEventId: COMPLETED_EVENT_ID,
      }),
    ).toThrow('immutable');
  });

  it('rejects stale, empty nonterminal, repeated-cursor, and incoherent transitions', () => {
    const base = {
      expectedOrdinal: 0,
      expectedCursor: null,
      nextCursor: 'cursor-1',
      checkpointedAt: '2026-10-10T00:00:01.000Z',
      observedDelta: 1,
      exhausted: false,
    } as const;
    expect(() => advanceCollectionRun(running(), { ...base, expectedOrdinal: 1 })).toThrow(
      StaleCollectionCheckpointError,
    );
    expect(() => advanceCollectionRun(running(), { ...base, observedDelta: 0 })).toThrow(
      'nonterminal page',
    );
    expect(() => advanceCollectionRun(running(), { ...base, nextCursor: null })).toThrow(
      'advance its cursor',
    );
    expect(() =>
      hydrateCollectionRun({
        ...running(),
        checkpoint: { ordinal: 2, cursor: 'cursor-2', checkpointedAt: null },
      }),
    ).toThrow('checkpointedAt');
  });

  it.each([null, 'cursor:1', '!'.repeat(300)])('accepts a safe opaque cursor %s', (cursor) => {
    expect(parseCollectionCheckpointCursor(cursor)).toBe(cursor);
  });

  it.each(['', 'has space', 'line\nbreak', '!'.repeat(301), 'não-ascii'])(
    'rejects unsafe cursor %s',
    (cursor) => expect(() => parseCollectionCheckpointCursor(cursor)).toThrow(TypeError),
  );
});
