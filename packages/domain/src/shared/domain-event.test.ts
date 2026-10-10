import { describe, expect, it } from 'vitest';

import { DomainEvent, type DomainEventInput } from './domain-event.js';
import { DomainValidationError } from './validation-error.js';

type ListingPriceChangedPayload = {
  readonly listingId: string;
  readonly changes: readonly { readonly priceInMinorUnits: number }[];
};

type ListingPriceChangedInput = DomainEventInput<
  'properties.listing.price-changed',
  ListingPriceChangedPayload
>;

class ListingPriceChanged extends DomainEvent<
  'properties.listing.price-changed',
  ListingPriceChangedPayload
> {
  public constructor(input: ListingPriceChangedInput) {
    super(input);
  }
}

const eventInput: ListingPriceChangedInput = {
  eventId: '01890f47-e6b5-7cc3-98c4-1c9d6a1f7e11',
  type: 'properties.listing.price-changed',
  version: 1,
  aggregateId: '01890f47-e6b5-7cc3-a8c4-1c9d6a1f7e12',
  occurredAt: '2026-10-10T09:30:00-03:00',
  traceContext: null,
  payload: {
    listingId: '01890f47-e6b5-7cc3-a8c4-1c9d6a1f7e12',
    changes: [{ priceInMinorUnits: 78_500_000 }],
  },
};

describe('DomainEvent', () => {
  it('creates a canonical, deeply immutable event with an explicit empty trace slot', () => {
    const event = new ListingPriceChanged(eventInput);

    expect(event.occurredAt).toBe('2026-10-10T12:30:00.000Z');
    expect(event.traceContext).toBeNull();
    expect(event.payload).toEqual(eventInput.payload);
    expect(event.payload).not.toBe(eventInput.payload);
    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event.payload)).toBe(true);
    expect(Object.isFrozen(event.payload.changes)).toBe(true);
    expect(Object.isFrozen(event.payload.changes[0])).toBe(true);
  });

  it('does not change when callers attempt to mutate metadata, trace context, or payload', () => {
    const event = new ListingPriceChanged({
      ...eventInput,
      traceContext: {
        traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
        tracestate: 'vendor=value',
      },
    });

    expect(() => Object.assign(event, { version: 2 })).toThrow(TypeError);
    expect(() => Object.assign(event.traceContext!, { tracestate: 'changed=value' })).toThrow(
      TypeError,
    );
    expect(() => Object.assign(event.payload.changes[0]!, { priceInMinorUnits: 1 })).toThrow(
      TypeError,
    );
    expect(event.version).toBe(1);
    expect(event.traceContext?.tracestate).toBe('vendor=value');
    expect(event.payload.changes[0]?.priceInMinorUnits).toBe(78_500_000);
  });

  it('snapshots accessor-backed event fields before validation', () => {
    let typeReads = 0;
    let payloadReads = 0;
    const changingInput = { ...eventInput } as unknown as Record<string, unknown>;
    Object.defineProperties(changingInput, {
      type: {
        enumerable: true,
        get: () => {
          typeReads += 1;
          return typeReads === 1 ? eventInput.type : 'garbage';
        },
      },
      payload: {
        enumerable: true,
        get: () => {
          payloadReads += 1;
          return payloadReads === 1 ? eventInput.payload : { unsupported: undefined };
        },
      },
    });

    const event = new ListingPriceChanged(changingInput as unknown as ListingPriceChangedInput);

    expect(event.type).toBe(eventInput.type);
    expect(event.payload).toEqual(eventInput.payload);
    expect(typeReads).toBe(1);
    expect(payloadReads).toBe(1);
  });

  it.each([
    'garbage',
    'Properties.listing.changed',
    ' properties.listing.changed',
    'a.b.c.d',
    'a..c',
  ])('rejects malformed event type %s', (type) => {
    const invalidInput = { ...eventInput, type } as unknown as ListingPriceChangedInput;
    expect(() => new ListingPriceChanged(invalidInput)).toThrow(DomainValidationError);
  });

  it('rejects malformed trace context', () => {
    expect(
      () => new ListingPriceChanged({ ...eventInput, traceContext: { traceparent: 'garbage' } }),
    ).toThrow(DomainValidationError);
  });

  it('rejects ambiguous timestamps', () => {
    expect(() => new ListingPriceChanged({ ...eventInput, occurredAt: '0' })).toThrow(
      DomainValidationError,
    );
  });

  it('rejects sparse or otherwise non-serializable payloads', () => {
    const sparse = new Array<unknown>(1);
    const invalidInput = {
      ...eventInput,
      payload: { ...eventInput.payload, sparse },
    } as unknown as ListingPriceChangedInput;

    expect(() => new ListingPriceChanged(invalidInput)).toThrow(DomainValidationError);
  });
});
