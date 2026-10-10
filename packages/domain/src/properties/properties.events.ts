import { parseSha256Hash } from '../collection/index.js';
import {
  DomainEvent,
  DomainValidationError,
  immutableTraceContext,
  parseRfc3339Timestamp,
  parseUuidV7,
  type TraceContext,
} from '../shared/index.js';
import {
  PROPERTY_TYPES,
  type ListingProvenance,
  type PropertyType,
} from './properties.read.types.js';

export const PROPERTIES_EVENT_TYPES = [
  'properties.listing.created',
  'properties.listing.price-changed',
  'properties.listing.description-changed',
  'properties.listing.removed',
  'properties.listing.reappeared',
  'properties.property.asking-price-changed',
  'properties.property.merged',
  'properties.property.split',
] as const;
export type PropertiesEventType = (typeof PROPERTIES_EVENT_TYPES)[number];
export interface ListingFact {
  readonly listingId: string;
  readonly propertyId: string;
  readonly sourceId: string;
  readonly sourceListingId: string;
  readonly placeId: string;
  readonly propertyType: PropertyType;
  readonly areaSquareMeters: number | null;
  readonly status: 'active' | 'removed';
  readonly askingPriceMinorUnits: number;
  readonly currency: 'BRL';
  readonly effectiveAt: string;
  readonly provenance: ListingProvenance;
}
export interface MinimumAskingPriceFact {
  readonly propertyId: string;
  readonly placeId: string;
  readonly areaSquareMeters: number | null;
  readonly minimumMinorUnits: number | null;
  readonly currency: 'BRL';
  readonly selectedListingId: string | null;
  readonly provenance: ListingProvenance | null;
  readonly activeListingIds: readonly string[];
}
interface ListingPayload {
  readonly revision: number;
  readonly effectiveAt: string;
  readonly listing: ListingFact;
}
interface PricePayload extends ListingPayload {
  readonly previousMinorUnits: number;
}
interface DescriptionPayload extends ListingPayload {
  readonly beforeHash: string;
  readonly afterHash: string;
}
interface PropertyPricePayload {
  readonly revision: number;
  readonly effectiveAt: string;
  readonly previous: MinimumAskingPriceFact;
  readonly current: MinimumAskingPriceFact;
}
interface ReassignmentPayload {
  readonly revision: number;
  readonly effectiveAt: string;
  readonly previous: readonly MinimumAskingPriceFact[];
  readonly resulting: readonly MinimumAskingPriceFact[];
  readonly listingFacts: readonly ListingFact[];
  readonly assignments: readonly {
    readonly listingId: string;
    readonly fromPropertyId: string;
    readonly toPropertyId: string;
  }[];
}
export interface PropertiesPayloadMap {
  readonly 'properties.listing.created': ListingPayload;
  readonly 'properties.listing.price-changed': PricePayload;
  readonly 'properties.listing.description-changed': DescriptionPayload;
  readonly 'properties.listing.removed': ListingPayload;
  readonly 'properties.listing.reappeared': ListingPayload;
  readonly 'properties.property.asking-price-changed': PropertyPricePayload;
  readonly 'properties.property.merged': ReassignmentPayload;
  readonly 'properties.property.split': ReassignmentPayload;
}
export interface PropertiesEventInput<T extends PropertiesEventType> {
  readonly eventId: string;
  readonly aggregateId: string;
  readonly occurredAt: string;
  readonly traceContext?: TraceContext | null;
  readonly payload: PropertiesPayloadMap[T];
}

function fail(): never {
  throw new DomainValidationError('Invalid properties event fact.', 'event');
}
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail();
  const result = value as Record<string, unknown>;
  if (
    Object.keys(result).length !== keys.length ||
    Object.keys(result).some((key) => !keys.includes(key))
  )
    fail();
  return result;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) fail();
  return value;
}
function slug(value: unknown): string {
  const result = text(value);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(result)) fail();
  return result;
}
function id(value: unknown): string {
  return parseUuidV7(text(value));
}
function date(value: unknown): string {
  const result = text(value);
  if (parseRfc3339Timestamp(result, 'effectiveAt') !== result) fail();
  return result;
}
function money(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) fail();
  return value;
}
function area(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0.01 || value > 1000000)
    fail();
  return value;
}
function ids(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length > 1000) fail();
  const result = value.map(id);
  if (new Set(result).size !== result.length) fail();
  return result;
}
function provenance(value: unknown): ListingProvenance {
  const p = record(value, [
    'sourceId',
    'sourceListingId',
    'sourceUrl',
    'runId',
    'snapshotId',
    'contentHash',
    'observedAt',
  ]);
  const sourceUrl = text(p.sourceUrl);
  const RuntimeUrl = Reflect.get(globalThis, 'URL') as new (input: string) => {
    protocol: string;
    username: string;
    password: string;
  };
  let url;
  try {
    url = new RuntimeUrl(sourceUrl);
  } catch {
    return fail();
  }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) fail();
  return {
    sourceId: slug(p.sourceId),
    sourceListingId: text(p.sourceListingId),
    sourceUrl,
    runId: id(p.runId),
    snapshotId: id(p.snapshotId),
    contentHash: parseSha256Hash(text(p.contentHash), 'contentHash'),
    observedAt: date(p.observedAt),
  };
}
function listingFact(value: unknown): ListingFact {
  const p = record(value, [
    'listingId',
    'propertyId',
    'sourceId',
    'sourceListingId',
    'placeId',
    'propertyType',
    'areaSquareMeters',
    'status',
    'askingPriceMinorUnits',
    'currency',
    'effectiveAt',
    'provenance',
  ]);
  if (
    !PROPERTY_TYPES.includes(p.propertyType as PropertyType) ||
    !['active', 'removed'].includes(text(p.status)) ||
    p.currency !== 'BRL'
  )
    fail();
  const result: ListingFact = {
    listingId: id(p.listingId),
    propertyId: id(p.propertyId),
    sourceId: slug(p.sourceId),
    sourceListingId: text(p.sourceListingId),
    placeId: slug(p.placeId),
    propertyType: p.propertyType as PropertyType,
    areaSquareMeters: area(p.areaSquareMeters),
    status: p.status as 'active' | 'removed',
    askingPriceMinorUnits: money(p.askingPriceMinorUnits),
    currency: 'BRL',
    effectiveAt: date(p.effectiveAt),
    provenance: provenance(p.provenance),
  };
  if (
    result.sourceId !== result.provenance.sourceId ||
    result.sourceListingId !== result.provenance.sourceListingId ||
    result.provenance.observedAt > result.effectiveAt ||
    (result.status === 'active' && result.effectiveAt !== result.provenance.observedAt)
  )
    fail();
  return result;
}
function minimumFact(value: unknown): MinimumAskingPriceFact {
  const p = record(value, [
    'propertyId',
    'placeId',
    'areaSquareMeters',
    'minimumMinorUnits',
    'currency',
    'selectedListingId',
    'provenance',
    'activeListingIds',
  ]);
  if (p.currency !== 'BRL') fail();
  const result: MinimumAskingPriceFact = {
    propertyId: id(p.propertyId),
    placeId: slug(p.placeId),
    areaSquareMeters: area(p.areaSquareMeters),
    minimumMinorUnits: p.minimumMinorUnits === null ? null : money(p.minimumMinorUnits),
    currency: 'BRL',
    selectedListingId: p.selectedListingId === null ? null : id(p.selectedListingId),
    provenance: p.provenance === null ? null : provenance(p.provenance),
    activeListingIds: ids(p.activeListingIds),
  };
  if (result.activeListingIds.length === 0) {
    if (
      result.minimumMinorUnits !== null ||
      result.selectedListingId !== null ||
      result.provenance !== null
    )
      fail();
  } else if (
    result.minimumMinorUnits === null ||
    result.selectedListingId === null ||
    result.provenance === null ||
    !result.activeListingIds.includes(result.selectedListingId)
  )
    fail();
  return result;
}
function payload<T extends PropertiesEventType>(
  type: T,
  value: unknown,
  aggregateId: string,
  occurredAt: string,
): PropertiesPayloadMap[T] {
  const extra =
    type === 'properties.listing.price-changed'
      ? ['previousMinorUnits']
      : type === 'properties.listing.description-changed'
        ? ['beforeHash', 'afterHash']
        : [];
  const listing = type.startsWith('properties.listing.');
  const p = record(
    value,
    listing
      ? ['revision', 'effectiveAt', 'listing', ...extra]
      : type === 'properties.property.asking-price-changed'
        ? ['revision', 'effectiveAt', 'previous', 'current']
        : ['revision', 'effectiveAt', 'previous', 'resulting', 'listingFacts', 'assignments'],
  );
  money(p.revision);
  const effectiveAt = date(p.effectiveAt);
  if (effectiveAt > occurredAt) fail();
  if (listing) {
    const fact = listingFact(p.listing);
    if (
      fact.listingId !== aggregateId ||
      fact.effectiveAt !== effectiveAt ||
      fact.status !== (type === 'properties.listing.removed' ? 'removed' : 'active')
    )
      fail();
    if (
      type === 'properties.listing.price-changed' &&
      money(p.previousMinorUnits) === fact.askingPriceMinorUnits
    )
      fail();
    if (type === 'properties.listing.description-changed') {
      if (
        parseSha256Hash(text(p.beforeHash), 'beforeHash') ===
        parseSha256Hash(text(p.afterHash), 'afterHash')
      )
        fail();
    }
  } else if (type === 'properties.property.asking-price-changed') {
    const previous = minimumFact(p.previous);
    const current = minimumFact(p.current);
    if (
      previous.propertyId !== aggregateId ||
      current.propertyId !== aggregateId ||
      previous.minimumMinorUnits === current.minimumMinorUnits ||
      [previous, current].some(
        (fact) => fact.provenance && fact.provenance.observedAt > effectiveAt,
      )
    )
      fail();
  } else {
    if (
      !Array.isArray(p.previous) ||
      !Array.isArray(p.resulting) ||
      !Array.isArray(p.listingFacts) ||
      !Array.isArray(p.assignments) ||
      p.assignments.length === 0
    )
      fail();
    const previous = p.previous.map(minimumFact);
    const resulting = p.resulting.map(minimumFact);
    if (
      [...previous, ...resulting].some(
        (fact) => fact.provenance && fact.provenance.observedAt > effectiveAt,
      )
    )
      fail();
    const from = previous.map((fact) => fact.propertyId);
    const to = resulting.map((fact) => fact.propertyId);
    if (
      new Set(from).size !== from.length ||
      new Set(to).size !== to.length ||
      !to.includes(aggregateId) ||
      (type === 'properties.property.merged'
        ? from.length < 2 || to.length !== 1
        : from.length !== 1 || to.length < 2)
    )
      fail();
    const assigned: string[] = [];
    for (const raw of p.assignments) {
      const assignment = record(raw, ['listingId', 'fromPropertyId', 'toPropertyId']);
      const listingId = id(assignment.listingId);
      const fromId = id(assignment.fromPropertyId);
      const toId = id(assignment.toPropertyId);
      if (!from.includes(fromId) || !to.includes(toId) || assigned.includes(listingId)) fail();
      assigned.push(listingId);
      if (
        previous.some(
          (fact) => fact.activeListingIds.includes(listingId) && fact.propertyId !== fromId,
        ) ||
        resulting.some(
          (fact) => fact.activeListingIds.includes(listingId) && fact.propertyId !== toId,
        )
      )
        fail();
    }
    const beforeActive = previous.flatMap((fact) => fact.activeListingIds);
    const afterActive = resulting.flatMap((fact) => fact.activeListingIds);
    if (
      new Set(beforeActive).size !== beforeActive.length ||
      new Set(afterActive).size !== afterActive.length ||
      beforeActive.length !== afterActive.length ||
      assigned.length !== beforeActive.length ||
      beforeActive.some(
        (listingId) => !afterActive.includes(listingId) || !assigned.includes(listingId),
      )
    )
      fail();
    const listingFacts = p.listingFacts.map(listingFact);
    if (
      listingFacts.length !== beforeActive.length ||
      new Set(listingFacts.map((fact) => fact.listingId)).size !== listingFacts.length ||
      listingFacts.some(
        (fact) =>
          fact.status !== 'active' ||
          fact.effectiveAt > effectiveAt ||
          !previous.some(
            (property) =>
              property.propertyId === fact.propertyId &&
              property.activeListingIds.includes(fact.listingId),
          ),
      )
    )
      fail();
    // Both sides derive their minima from the same immutable listing prices. Reassignment
    // changes membership only; a simultaneous asking-price change requires its own event.
    for (const property of [...previous, ...resulting]) {
      if (property.activeListingIds.length === 0) continue;
      const members = listingFacts.filter((fact) =>
        property.activeListingIds.includes(fact.listingId),
      );
      const selected = members.find((fact) => fact.listingId === property.selectedListingId);
      if (
        members.length !== property.activeListingIds.length ||
        !selected ||
        property.minimumMinorUnits !==
          Math.min(...members.map((fact) => fact.askingPriceMinorUnits)) ||
        selected.askingPriceMinorUnits !== property.minimumMinorUnits ||
        Object.entries(selected.provenance).some(
          ([key, value]) => value !== property.provenance?.[key as keyof ListingProvenance],
        )
      )
        fail();
    }
  }
  return value as PropertiesPayloadMap[T];
}
export class PropertiesEvent<
  T extends PropertiesEventType = PropertiesEventType,
> extends DomainEvent<T, PropertiesPayloadMap[T]> {
  public constructor(type: T, input: PropertiesEventInput<T>) {
    if (!PROPERTIES_EVENT_TYPES.includes(type)) fail();
    const aggregateId = id(input.aggregateId);
    const occurredAt = date(input.occurredAt);
    super({
      ...input,
      aggregateId,
      occurredAt,
      type,
      version: 1,
      traceContext: input.traceContext ?? null,
      payload: payload(type, input.payload, aggregateId, occurredAt),
    });
  }
}
export function parsePropertiesEvent(value: unknown): PropertiesEvent {
  const p = record(value, [
    'eventId',
    'type',
    'version',
    'aggregateId',
    'occurredAt',
    'traceContext',
    'payload',
  ]);
  if (!PROPERTIES_EVENT_TYPES.includes(p.type as PropertiesEventType) || p.version !== 1) fail();
  let traceContext: TraceContext | null = null;
  if (p.traceContext !== null) {
    const trace = record(
      p.traceContext,
      typeof p.traceContext === 'object' &&
        p.traceContext !== null &&
        'tracestate' in p.traceContext
        ? ['traceparent', 'tracestate']
        : ['traceparent'],
    );
    traceContext = immutableTraceContext(
      trace.tracestate === undefined
        ? { traceparent: text(trace.traceparent) }
        : { traceparent: text(trace.traceparent), tracestate: text(trace.tracestate) },
    );
  }
  return new PropertiesEvent(p.type as PropertiesEventType, {
    eventId: id(p.eventId),
    aggregateId: id(p.aggregateId),
    occurredAt: date(p.occurredAt),
    traceContext,
    payload: p.payload as PropertiesPayloadMap[PropertiesEventType],
  });
}
