import {
  DomainEvent,
  DomainValidationError,
  parseRfc3339Timestamp,
  parseUuidV7,
  type TraceContext,
} from '../shared/index.js';
import { parseCollectionSourceListingId } from '../collection/index.js';

export const PROPERTIES_LISTING_SUPPRESSED_TYPE = 'properties.listing.suppressed' as const;
export interface SuppressedPropertyChange {
  readonly previousPropertyId: string;
  readonly propertyId: string | null;
  readonly previousRevision: number;
  readonly revision: number;
}
export interface PropertiesListingSuppressedPayload {
  readonly causeEventId: string;
  readonly suppressionId: string;
  readonly sourceId: string;
  readonly sourceListingId: string;
  readonly listingId: string | null;
  readonly originalPropertyId: string | null;
  readonly listingRevision: number | null;
  readonly assignmentRevision: number | null;
  readonly changes: readonly SuppressedPropertyChange[];
}
function fail(): never {
  throw new DomainValidationError('Invalid properties suppression event.', 'event');
}
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
  const p = value as Record<string, unknown>;
  if (Object.keys(p).length !== keys.length || Object.keys(p).some((key) => !keys.includes(key)))
    fail();
  return p;
}
function id(value: unknown): string {
  if (typeof value !== 'string') fail();
  return parseUuidV7(value);
}
function counter(value: unknown, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) fail();
  return value;
}
function array(value: unknown): readonly unknown[] {
  if (!Array.isArray(value) || value.length > 1000) fail();
  return value;
}
/** Permanent erasure is a distinct fact: no previous price or removed provenance crosses this boundary. */
export class PropertiesListingSuppressed extends DomainEvent<
  typeof PROPERTIES_LISTING_SUPPRESSED_TYPE,
  PropertiesListingSuppressedPayload
> {
  public constructor(input: {
    readonly eventId: string;
    readonly aggregateId: string;
    readonly occurredAt: string;
    readonly traceContext?: TraceContext | null;
    readonly payload: PropertiesListingSuppressedPayload;
  }) {
    const p = record(input.payload, [
      'causeEventId',
      'suppressionId',
      'sourceId',
      'sourceListingId',
      'listingId',
      'originalPropertyId',
      'listingRevision',
      'assignmentRevision',
      'changes',
    ]);
    const listingId = p.listingId === null ? null : id(p.listingId);
    const originalPropertyId = p.originalPropertyId === null ? null : id(p.originalPropertyId);
    if (
      (listingId === null) !== (originalPropertyId === null) ||
      typeof p.sourceId !== 'string' ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.sourceId) ||
      typeof p.sourceListingId !== 'string'
    )
      fail();
    const sourceListingId = parseCollectionSourceListingId(p.sourceListingId);
    const listingRevision = p.listingRevision === null ? null : counter(p.listingRevision, 1);
    const assignmentRevision = p.assignmentRevision === null ? null : counter(p.assignmentRevision);
    if (!listingId && (listingRevision !== null || assignmentRevision !== null)) fail();
    const occurredAt = parseRfc3339Timestamp(input.occurredAt, 'occurredAt');
    const changes = array(p.changes).map((raw) => {
      const c = record(raw, ['previousPropertyId', 'propertyId', 'previousRevision', 'revision']);
      const previousPropertyId = id(c.previousPropertyId),
        propertyId = c.propertyId === null ? null : id(c.propertyId);
      if (propertyId !== null && propertyId === originalPropertyId) fail();
      const previousRevision = counter(c.previousRevision),
        revision = counter(c.revision, 1);
      if (revision <= previousRevision) fail();
      return { previousPropertyId, propertyId, previousRevision, revision };
    });
    if (
      new Set(changes.map((c) => c.previousPropertyId)).size !== changes.length ||
      (!listingId && changes.length) ||
      new Set(changes.flatMap((change) => (change.propertyId ? [change.propertyId] : []))).size !==
        changes.filter((change) => change.propertyId !== null).length
    )
      fail();
    const suppressionId = id(p.suppressionId);
    if (input.aggregateId !== (listingId ?? suppressionId)) fail();
    super({
      ...input,
      occurredAt,
      type: PROPERTIES_LISTING_SUPPRESSED_TYPE,
      version: 1,
      traceContext: input.traceContext ?? null,
      payload: {
        causeEventId: id(p.causeEventId),
        suppressionId,
        sourceId: p.sourceId,
        sourceListingId,
        listingId,
        originalPropertyId,
        listingRevision,
        assignmentRevision,
        changes,
      },
    });
  }
}
export function parsePropertiesListingSuppressed(value: unknown): PropertiesListingSuppressed {
  const p = record(value, [
    'eventId',
    'type',
    'version',
    'aggregateId',
    'occurredAt',
    'traceContext',
    'payload',
  ]);
  if (
    p.type !== PROPERTIES_LISTING_SUPPRESSED_TYPE ||
    p.version !== 1 ||
    typeof p.occurredAt !== 'string'
  )
    fail();
  if (p.traceContext !== null)
    record(
      p.traceContext,
      typeof p.traceContext === 'object' &&
        p.traceContext !== null &&
        'tracestate' in p.traceContext
        ? ['traceparent', 'tracestate']
        : ['traceparent'],
    );
  return new PropertiesListingSuppressed({
    eventId: id(p.eventId),
    aggregateId: id(p.aggregateId),
    occurredAt: p.occurredAt,
    traceContext: p.traceContext as TraceContext | null,
    payload: p.payload as PropertiesListingSuppressedPayload,
  });
}
