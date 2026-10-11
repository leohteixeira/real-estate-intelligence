import {
  DomainEvent,
  DomainValidationError,
  parseRfc3339Timestamp,
  parseUuidV7,
  type TraceContext,
} from '../shared/index.js';
import {
  PROPERTIES_EVENT_TYPES,
  parsePropertiesEvent,
  parseListingFact,
  parseMinimumAskingPriceFact,
  type ListingFact,
  type MinimumAskingPriceFact,
  type PropertiesEventType,
  type PropertiesPayloadMap,
} from './properties.events.js';

export interface CausalListingState {
  readonly listing: ListingFact;
  readonly revision: number;
  readonly assignmentRevision: number;
}
export interface CausalListingAssignment {
  readonly listingId: string;
  readonly fromPropertyId: string;
  readonly toPropertyId: string;
  readonly fromAssignmentRevision: number;
  readonly assignmentRevision: number;
}
type ListingType = Extract<PropertiesEventType, `properties.listing.${string}`>;
type PropertyType = Exclude<PropertiesEventType, ListingType>;
export type PropertiesV2PayloadMap = {
  readonly [T in ListingType]: PropertiesPayloadMap[T] & { readonly assignmentRevision: number };
} & {
  readonly 'properties.property.asking-price-changed': PropertiesPayloadMap['properties.property.asking-price-changed'] & {
    readonly listingStates: readonly CausalListingState[];
  };
} & {
  readonly [T in Exclude<PropertyType, 'properties.property.asking-price-changed'>]: Omit<
    PropertiesPayloadMap[T],
    'listingFacts' | 'assignments'
  > & {
    readonly listingStates: readonly CausalListingState[];
    readonly assignments: readonly CausalListingAssignment[];
  };
};
function fail(): never {
  throw new DomainValidationError('Invalid causal properties event.', 'event');
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
function counter(value: unknown, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) fail();
  return value;
}
function id(value: unknown): string {
  if (typeof value !== 'string') fail();
  return parseUuidV7(value);
}
function date(value: unknown): string {
  if (typeof value !== 'string' || parseRfc3339Timestamp(value, 'effectiveAt') !== value) fail();
  return value;
}
function array(value: unknown): readonly unknown[] {
  if (!Array.isArray(value) || value.length > 1000) fail();
  return value;
}

/** The public snapshot describes exactly the declared active members, before eligibility filters. */
function validateMinimum(fact: MinimumAskingPriceFact, states: readonly ListingFact[]): void {
  const members = states
    .filter((listing) => listing.propertyId === fact.propertyId && listing.status === 'active')
    .sort(
      (a, b) =>
        a.askingPriceMinorUnits - b.askingPriceMinorUnits || (a.listingId < b.listingId ? -1 : 1),
    );
  if (
    members.length !== fact.activeListingIds.length ||
    members.some((member) => !fact.activeListingIds.includes(member.listingId))
  )
    fail();
  const selected = members[0];
  if (!selected) return;
  if (
    fact.selectedListingId !== selected.listingId ||
    fact.minimumMinorUnits !== selected.askingPriceMinorUnits ||
    fact.placeId !== selected.placeId ||
    fact.areaSquareMeters !== selected.areaSquareMeters ||
    !fact.provenance ||
    Object.entries(selected.provenance).some(
      ([key, value]) => value !== fact.provenance?.[key as keyof typeof selected.provenance],
    )
  )
    fail();
}
export class PropertiesEventV2<
  T extends PropertiesEventType = PropertiesEventType,
> extends DomainEvent<T, PropertiesV2PayloadMap[T]> {
  public constructor(
    type: T,
    input: {
      readonly eventId: string;
      readonly aggregateId: string;
      readonly occurredAt: string;
      readonly traceContext?: TraceContext | null;
      readonly payload: PropertiesV2PayloadMap[T];
    },
  ) {
    if (!PROPERTIES_EVENT_TYPES.includes(type)) fail();
    const aggregateId = id(input.aggregateId);
    const occurredAt = date(input.occurredAt);
    const listingEvent = type.startsWith('properties.listing.');
    const extra =
      type === 'properties.listing.price-changed'
        ? ['previousMinorUnits']
        : type === 'properties.listing.description-changed'
          ? ['beforeHash', 'afterHash']
          : [];
    const price = type === 'properties.property.asking-price-changed';
    const p = record(
      input.payload,
      listingEvent
        ? ['revision', 'effectiveAt', 'listing', 'assignmentRevision', ...extra]
        : price
          ? ['revision', 'effectiveAt', 'previous', 'current', 'listingStates']
          : ['revision', 'effectiveAt', 'previous', 'resulting', 'listingStates', 'assignments'],
    );
    counter(p.revision, 1);
    const canonicalPayload = { ...input.payload };
    const effectiveAt = date(p.effectiveAt);
    if (effectiveAt > occurredAt) fail();
    if (listingEvent) {
      counter(p.assignmentRevision);
      const legacy = Object.fromEntries(
        Object.entries(p).filter(([key]) => key !== 'assignmentRevision'),
      );
      parsePropertiesEvent({
        type,
        version: 1,
        eventId: input.eventId,
        aggregateId,
        occurredAt,
        traceContext: input.traceContext ?? null,
        payload: legacy,
      });
      Object.assign(canonicalPayload, { listing: parseListingFact(p.listing) });
    } else {
      const states = array(p.listingStates).map((raw) => {
        const state = record(raw, ['listing', 'revision', 'assignmentRevision']);
        const listing = parseListingFact(state.listing);
        if (listing.effectiveAt > effectiveAt) fail();
        return {
          listing,
          revision: counter(state.revision, 1),
          assignmentRevision: counter(state.assignmentRevision),
        };
      });
      if (new Set(states.map((state) => state.listing.listingId)).size !== states.length) fail();
      Object.assign(canonicalPayload, { listingStates: states });
      if (price) {
        const previous = parseMinimumAskingPriceFact(p.previous);
        const current = parseMinimumAskingPriceFact(p.current);
        if (
          previous.propertyId !== aggregateId ||
          current.propertyId !== aggregateId ||
          previous.minimumMinorUnits === current.minimumMinorUnits ||
          states.some((state) => state.listing.propertyId !== aggregateId) ||
          [previous, current].some(
            (fact) => fact.provenance && fact.provenance.observedAt > effectiveAt,
          )
        )
          fail();
        validateMinimum(
          current,
          states.map((state) => state.listing),
        );
        Object.assign(canonicalPayload, { previous, current });
      } else {
        const previous = array(p.previous).map(parseMinimumAskingPriceFact);
        const resulting = array(p.resulting).map(parseMinimumAskingPriceFact);
        const from = previous.map((fact) => fact.propertyId);
        const to = resulting.map((fact) => fact.propertyId);
        if (
          new Set(from).size !== from.length ||
          new Set(to).size !== to.length ||
          !to.includes(aggregateId) ||
          (type === 'properties.property.merged'
            ? from.length < 2 || to.length !== 1
            : from.length !== 1 || to.length < 2) ||
          [...previous, ...resulting].some(
            (fact) => fact.provenance && fact.provenance.observedAt > effectiveAt,
          )
        )
          fail();
        const assignments = array(p.assignments).map((raw) => {
          const a = record(raw, [
            'listingId',
            'fromPropertyId',
            'toPropertyId',
            'fromAssignmentRevision',
            'assignmentRevision',
          ]);
          return {
            listingId: id(a.listingId),
            fromPropertyId: id(a.fromPropertyId),
            toPropertyId: id(a.toPropertyId),
            fromAssignmentRevision: counter(a.fromAssignmentRevision),
            assignmentRevision: counter(a.assignmentRevision, 1),
          };
        });
        if (
          !states.length ||
          assignments.length !== states.length ||
          new Set(assignments.map((a) => a.listingId)).size !== assignments.length
        )
          fail();
        for (const state of states) {
          const a = assignments.find((item) => item.listingId === state.listing.listingId);
          if (
            !a ||
            !from.includes(a.fromPropertyId) ||
            !to.includes(a.toPropertyId) ||
            a.fromPropertyId !== state.listing.propertyId ||
            a.fromAssignmentRevision !== state.assignmentRevision ||
            !Number.isSafeInteger(a.fromAssignmentRevision + 1) ||
            a.assignmentRevision !== a.fromAssignmentRevision + 1
          )
            fail();
        }
        for (const fact of previous)
          validateMinimum(
            fact,
            states.map((state) => state.listing),
          );
        const after = states.map((state) => ({
          ...state.listing,
          propertyId: assignments.find((a) => a.listingId === state.listing.listingId)!
            .toPropertyId,
        }));
        for (const fact of resulting) validateMinimum(fact, after);
        Object.assign(canonicalPayload, { previous, resulting, assignments });
      }
    }
    super({
      ...input,
      aggregateId,
      occurredAt,
      type,
      version: 2,
      payload: canonicalPayload,
      traceContext: input.traceContext ?? null,
    });
  }
}
export function parsePropertiesEventV2(value: unknown): PropertiesEventV2 {
  const p = record(value, [
    'eventId',
    'type',
    'version',
    'aggregateId',
    'occurredAt',
    'traceContext',
    'payload',
  ]);
  if (p.version !== 2 || !PROPERTIES_EVENT_TYPES.includes(p.type as PropertiesEventType)) fail();
  // Close the trace shape before the shared immutable envelope validates its values.
  const trace =
    p.traceContext === null
      ? null
      : record(
          p.traceContext,
          typeof p.traceContext === 'object' &&
            p.traceContext !== null &&
            'tracestate' in p.traceContext
            ? ['traceparent', 'tracestate']
            : ['traceparent'],
        );
  if (
    trace &&
    (typeof trace.traceparent !== 'string' ||
      (trace.tracestate !== undefined && typeof trace.tracestate !== 'string'))
  )
    fail();
  return new PropertiesEventV2(p.type as PropertiesEventType, {
    eventId: id(p.eventId),
    aggregateId: id(p.aggregateId),
    occurredAt: date(p.occurredAt),
    traceContext: trace as TraceContext | null,
    payload: p.payload as PropertiesV2PayloadMap[PropertiesEventType],
  });
}
