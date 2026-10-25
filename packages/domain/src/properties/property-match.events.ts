import {
  DomainEvent,
  DomainValidationError,
  parseUuidV7,
  type TraceContext,
} from '../shared/index.js';
import {
  RESOLUTION_FEATURES,
  resolutionBand,
  type ResolutionComparison,
} from './property-resolution.js';

export interface MatchReviewPayload {
  readonly configurationId: string;
  readonly configurationVersion: number;
  readonly comparison: ResolutionComparison;
}
function fail(): never {
  throw new DomainValidationError('Invalid match review event.', 'event');
}
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
  const row = value as Record<string, unknown>;
  if (Object.keys(row).sort().join(',') !== [...keys].sort().join(',')) fail();
  return row;
}
function score(value: unknown): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) fail();
}
export class PropertyMatchQueuedForReview extends DomainEvent<
  'properties.match.queued-for-review',
  MatchReviewPayload
> {
  public constructor(input: {
    readonly eventId: string;
    readonly aggregateId: string;
    readonly occurredAt: string;
    readonly traceContext?: TraceContext | null;
    readonly payload: MatchReviewPayload;
  }) {
    const p = record(input.payload, ['configurationId', 'configurationVersion', 'comparison']);
    if (
      typeof p.configurationId !== 'string' ||
      !/^[a-z][a-z0-9-]{0,63}$/.test(p.configurationId) ||
      typeof p.configurationVersion !== 'number' ||
      !Number.isSafeInteger(p.configurationVersion) ||
      p.configurationVersion < 1
    )
      fail();
    const c = record(p.comparison, [
      'leftListingId',
      'rightListingId',
      'leftInputEventId',
      'rightInputEventId',
      'rawProbability',
      'probability',
      'availableWeight',
      'incompatibilities',
      'reasons',
      'decision',
    ]);
    for (const field of [
      'leftListingId',
      'rightListingId',
      'leftInputEventId',
      'rightInputEventId',
    ]) {
      if (typeof c[field] !== 'string') fail();
      parseUuidV7(c[field]);
    }
    if (
      c.leftListingId === c.rightListingId ||
      input.aggregateId !== c.leftListingId ||
      c.decision !== 'review'
    )
      fail();
    for (const field of ['rawProbability', 'probability', 'availableWeight']) score(c[field]);
    if (
      resolutionBand(c.probability as number) !== 'review' ||
      !Array.isArray(c.incompatibilities) ||
      c.incompatibilities.length !== 0 ||
      !Array.isArray(c.reasons) ||
      c.reasons.length !== RESOLUTION_FEATURES.length
    )
      fail();
    c.reasons.forEach((reason, index) => {
      const r = record(reason, [
        'feature',
        'available',
        'score',
        'baseWeight',
        'effectiveWeight',
        'contribution',
      ]);
      if (r.feature !== RESOLUTION_FEATURES[index] || typeof r.available !== 'boolean') fail();
      for (const field of ['baseWeight', 'effectiveWeight', 'contribution']) score(r[field]);
      if (r.available) score(r.score);
      else if (r.score !== null || r.effectiveWeight !== 0 || r.contribution !== 0) fail();
    });
    super({
      ...input,
      type: 'properties.match.queued-for-review',
      version: 1,
      traceContext: input.traceContext ?? null,
    });
  }
}
export function parsePropertyMatchQueuedForReview(value: unknown): PropertyMatchQueuedForReview {
  const row = record(value, [
    'eventId',
    'type',
    'version',
    'aggregateId',
    'occurredAt',
    'traceContext',
    'payload',
  ]);
  if (
    row.type !== 'properties.match.queued-for-review' ||
    row.version !== 1 ||
    typeof row.eventId !== 'string' ||
    typeof row.aggregateId !== 'string' ||
    typeof row.occurredAt !== 'string'
  )
    fail();
  if (row.traceContext !== null)
    record(
      row.traceContext,
      typeof row.traceContext === 'object' &&
        row.traceContext !== null &&
        'tracestate' in row.traceContext
        ? ['traceparent', 'tracestate']
        : ['traceparent'],
    );
  return new PropertyMatchQueuedForReview({
    eventId: row.eventId,
    aggregateId: row.aggregateId,
    occurredAt: row.occurredAt,
    traceContext: row.traceContext as TraceContext | null,
    payload: row.payload as MatchReviewPayload,
  });
}
