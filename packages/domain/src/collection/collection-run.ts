import { parseRfc3339Timestamp, type UuidV7 } from '../shared/index.js';
import type { Sha256Hash } from './sha256-hash.js';
import { SOURCE_ACCESS_REFUSALS, type SourceHold } from './source-registration.js';

export const COLLECTION_CHECKPOINT_CURSOR_MAX_LENGTH = 300;
const SAFE_CURSOR = /^[\x21-\x7e]{1,300}$/;

export type CollectionRunStatus = 'running' | 'paused' | 'completed' | 'failed';

export interface CollectionCheckpoint {
  readonly ordinal: number;
  readonly cursor: string | null;
  readonly checkpointedAt: string | null;
}

export interface CollectionRunCounts {
  readonly observed: number;
  readonly parsed: number;
  readonly changed: number;
  readonly suppressed: number;
  readonly failed: number;
}

export interface CollectionRunState {
  readonly pause: SourceHold | null;
  readonly operationKey: string;
  readonly runId: UuidV7;
  readonly sourceId: string;
  readonly status: CollectionRunStatus;
  readonly startedAt: string;
  readonly checkpoint: CollectionCheckpoint;
  readonly counts: CollectionRunCounts;
  readonly completedAt: string | null;
  readonly manifestHash: Sha256Hash | null;
  readonly completedEventId: UuidV7 | null;
}

export class StaleCollectionCheckpointError extends Error {
  public constructor() {
    super('The collection checkpoint is stale.');
    this.name = 'StaleCollectionCheckpointError';
  }
}

export function parseCollectionCheckpointCursor(value: string | null): string | null {
  if (value === null) return null;
  if (!SAFE_CURSOR.test(value)) {
    throw new TypeError(
      `checkpoint cursor must contain 1-${COLLECTION_CHECKPOINT_CURSOR_MAX_LENGTH} printable, non-whitespace ASCII characters.`,
    );
  }
  return value;
}

function nonnegativeInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${field} must be a nonnegative safe integer.`);
  }
  return value;
}

function freezeRun(input: CollectionRunState): CollectionRunState {
  return Object.freeze({
    ...input,
    checkpoint: Object.freeze({ ...input.checkpoint }),
    counts: Object.freeze({ ...input.counts }),
    pause: input.pause === null ? null : Object.freeze({ ...input.pause }),
  });
}

export function createRunningCollectionRun(input: {
  readonly operationKey: string;
  readonly runId: UuidV7;
  readonly sourceId: string;
  readonly startedAt: string;
}): CollectionRunState {
  parseRfc3339Timestamp(input.startedAt, 'startedAt');
  return freezeRun({
    ...input,
    status: 'running',
    pause: null,
    checkpoint: { ordinal: 0, cursor: null, checkpointedAt: null },
    counts: { observed: 0, parsed: 0, changed: 0, suppressed: 0, failed: 0 },
    completedAt: null,
    manifestHash: null,
    completedEventId: null,
  });
}

export function hydrateCollectionRun(input: CollectionRunState): CollectionRunState {
  if (!['running', 'paused', 'completed', 'failed'].includes(input.status))
    throw new TypeError('Unsupported collection run status.');
  if (input.status === 'paused') {
    if (!input.pause || !SOURCE_ACCESS_REFUSALS.includes(input.pause.reason))
      throw new TypeError('A paused run requires a canonical pause reason.');
    parseRfc3339Timestamp(input.pause.heldAt, 'pause.heldAt');
  } else if (input.pause !== null) throw new TypeError('Only paused runs carry pause metadata.');
  if (!input.operationKey || !input.sourceId)
    throw new TypeError('Collection run identity is required.');
  parseRfc3339Timestamp(input.startedAt, 'startedAt');
  const ordinal = nonnegativeInteger(input.checkpoint.ordinal, 'checkpoint.ordinal');
  const cursor = parseCollectionCheckpointCursor(input.checkpoint.cursor);
  if (ordinal === 0 && cursor !== null) {
    throw new TypeError('Checkpoint ordinal zero must have a null cursor.');
  }
  if (ordinal > 0 && input.checkpoint.checkpointedAt === null) {
    throw new TypeError('An advanced checkpoint requires checkpointedAt.');
  }
  if (input.checkpoint.checkpointedAt !== null) {
    parseRfc3339Timestamp(input.checkpoint.checkpointedAt, 'checkpoint.checkpointedAt');
  }
  const counts = {
    observed: nonnegativeInteger(input.counts.observed, 'counts.observed'),
    parsed: nonnegativeInteger(input.counts.parsed, 'counts.parsed'),
    changed: nonnegativeInteger(input.counts.changed, 'counts.changed'),
    suppressed: nonnegativeInteger(input.counts.suppressed, 'counts.suppressed'),
    failed: nonnegativeInteger(input.counts.failed, 'counts.failed'),
  };
  if (counts.parsed + counts.suppressed + counts.failed > counts.observed) {
    throw new TypeError('Collection run counts are incoherent.');
  }
  if (counts.changed > counts.parsed) {
    throw new TypeError('Changed collection observations cannot exceed parsed observations.');
  }
  if (input.status !== 'completed') {
    if (
      input.completedAt !== null ||
      input.manifestHash !== null ||
      input.completedEventId !== null
    ) {
      throw new TypeError('A running collection run cannot carry terminal fields.');
    }
  } else if (
    input.completedAt === null ||
    input.manifestHash === null ||
    input.completedEventId === null
  ) {
    throw new TypeError('A completed collection run requires every terminal field.');
  } else {
    parseRfc3339Timestamp(input.completedAt, 'completedAt');
  }
  return freezeRun({ ...input, checkpoint: { ...input.checkpoint, ordinal, cursor }, counts });
}

export function pauseCollectionRun(run: CollectionRunState, pause: SourceHold): CollectionRunState {
  if (run.status === 'completed' || run.status === 'failed')
    throw new TypeError('A terminal collection run is immutable.');
  if (run.status === 'paused') return run;
  return hydrateCollectionRun({ ...run, status: 'paused', pause: Object.freeze({ ...pause }) });
}

/** Failure preserves the operation's ownership and chronology without complete-manifest authority. */
export function failCollectionRun(run: CollectionRunState): CollectionRunState {
  if (run.status !== 'running') return run;
  return hydrateCollectionRun({ ...run, status: 'failed' });
}

export function resumeCollectionRun(run: CollectionRunState): CollectionRunState {
  if (run.status !== 'paused')
    throw new TypeError('Only a paused collection run can be explicitly resumed.');
  return hydrateCollectionRun({ ...run, status: 'running', pause: null });
}

export function advanceCollectionRun(
  run: CollectionRunState,
  input: {
    readonly expectedOrdinal: number;
    readonly expectedCursor: string | null;
    readonly nextCursor: string | null;
    readonly checkpointedAt: string;
    readonly observedDelta: number;
    readonly parsedDelta?: number;
    readonly changedDelta?: number;
    readonly suppressedDelta?: number;
    readonly failedDelta?: number;
    readonly exhausted: boolean;
    readonly completedAt?: string;
    readonly manifestHash?: Sha256Hash;
    readonly completedEventId?: UuidV7;
  },
): CollectionRunState {
  if (run.status !== 'running') throw new TypeError('A completed collection run is immutable.');
  if (
    input.expectedOrdinal !== run.checkpoint.ordinal ||
    input.expectedCursor !== run.checkpoint.cursor
  ) {
    throw new StaleCollectionCheckpointError();
  }
  const observedDelta = nonnegativeInteger(input.observedDelta, 'observedDelta');
  const parsedDelta = nonnegativeInteger(input.parsedDelta ?? observedDelta, 'parsedDelta');
  const changedDelta = nonnegativeInteger(input.changedDelta ?? 0, 'changedDelta');
  const suppressedDelta = nonnegativeInteger(input.suppressedDelta ?? 0, 'suppressedDelta');
  const failedDelta = nonnegativeInteger(input.failedDelta ?? 0, 'failedDelta');
  if (parsedDelta + suppressedDelta + failedDelta > observedDelta || changedDelta > parsedDelta) {
    throw new TypeError('Collection run count deltas are incoherent.');
  }
  const nextCursor = parseCollectionCheckpointCursor(input.nextCursor);
  parseRfc3339Timestamp(input.checkpointedAt, 'checkpointedAt');
  if (!input.exhausted && observedDelta === 0) {
    throw new TypeError('A nonterminal page must contain at least one observation.');
  }
  if (!input.exhausted && nextCursor === input.expectedCursor) {
    throw new TypeError('A nonterminal page must advance its cursor.');
  }
  const checkpoint = {
    ordinal: run.checkpoint.ordinal + 1,
    cursor: nextCursor,
    checkpointedAt: input.checkpointedAt,
  };
  const counts = {
    ...run.counts,
    observed: run.counts.observed + observedDelta,
    parsed: run.counts.parsed + parsedDelta,
    changed: run.counts.changed + changedDelta,
    suppressed: run.counts.suppressed + suppressedDelta,
    failed: run.counts.failed + failedDelta,
  };
  if (!input.exhausted) {
    if (input.completedAt || input.manifestHash || input.completedEventId) {
      throw new TypeError('A nonterminal transition cannot carry terminal fields.');
    }
    return freezeRun({ ...run, checkpoint, counts });
  }
  if (!input.completedAt || !input.manifestHash || !input.completedEventId) {
    throw new TypeError('A terminal transition requires completion time, manifest, and event ID.');
  }
  parseRfc3339Timestamp(input.completedAt, 'completedAt');
  return freezeRun({
    ...run,
    status: 'completed',
    checkpoint,
    counts,
    completedAt: input.completedAt,
    manifestHash: input.manifestHash,
    completedEventId: input.completedEventId,
  });
}
