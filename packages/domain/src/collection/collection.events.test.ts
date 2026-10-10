import { describe, expect, it } from 'vitest';

import { DomainValidationError } from '../shared/index.js';
import {
  COLLECTION_EVENT_VERSION,
  COLLECTION_LISTING_SUPPRESSED_TYPE,
  COLLECTION_RUN_COMPLETED_TYPE,
  COLLECTION_SNAPSHOT_PARSED_TYPE,
  CollectionListingSuppressed,
  CollectionRunCompleted,
  CollectionSnapshotParsed,
  parseCollectionEvent,
  parseCollectionListingSuppressed,
  parseCollectionRunCompleted,
  parseCollectionSnapshotParsed,
  type CollectionSnapshotParsedInput,
  type Sha256Hash,
  type UuidV7,
} from './index.js';

const RUN_ID = '0199c8f2-2394-7ba0-8f9e-286378779210' as UuidV7;
const SNAPSHOT_ID = '0199c8f2-2394-7ba0-8f9e-286378779211' as UuidV7;
const HASH = `sha256:${'a'.repeat(64)}` as Sha256Hash;

function parsedInput(): CollectionSnapshotParsedInput {
  return {
    eventId: '0199c8f2-2394-7ba0-8f9e-286378779212',
    aggregateId: SNAPSHOT_ID,
    occurredAt: '2026-10-10T12:00:00.000Z',
    traceContext: null,
    payload: {
      run: { runId: RUN_ID },
      snapshot: { snapshotId: SNAPSHOT_ID, contentHash: HASH },
      source: {
        sourceId: 'synthetic-data',
        sourceListingId: 'SYN-001',
        sourceUrl: 'https://synthetic.invalid/listings/SYN-001',
        observedAt: '2026-10-10T11:59:59.000Z',
      },
      listing: {
        propertyType: 'apartment',
        askingPriceMinorUnits: 50_000_000,
        currency: 'BRL',
        areaSquareMeters: 80.5,
        bedrooms: 2,
        bathrooms: 2,
        parkingSpaces: 1,
        features: ['balcony'],
        location: {
          city: 'São Paulo',
          stateCode: 'SP',
          neighborhood: 'Centro',
          street: 'Rua Exemplo',
        },
        listedAt: '2026-10-09T10:00:00-03:00',
        advertiser: { type: 'agency', agencyName: 'Synthetic Realty Ltda.' },
        maskedDescription: 'Call [REDACTED] for details.',
        imageFingerprints: ['fixture-fingerprint:v1:synthetic-001'],
      },
    },
  };
}

function wire<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

type MutableWireRecord = Record<string, unknown>;

function mutableRecord(value: unknown): MutableWireRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Expected a mutable wire object.');
  }
  return value as MutableWireRecord;
}

function nested(value: MutableWireRecord, ...keys: readonly string[]): MutableWireRecord {
  let current = value;
  for (const key of keys) current = mutableRecord(current[key]);
  return current;
}

function mutableParsedWire(): MutableWireRecord {
  return mutableRecord(wire(new CollectionSnapshotParsed(parsedInput())));
}

describe('collection event contracts', () => {
  it('constructs immutable, correlated version-1 events', () => {
    const parsed = new CollectionSnapshotParsed(parsedInput());
    const completed = new CollectionRunCompleted({
      eventId: '0199c8f2-2394-7ba0-8f9e-286378779213',
      aggregateId: RUN_ID,
      occurredAt: '2026-10-10T12:00:01Z',
      payload: {
        sourceId: 'synthetic-data',
        observedCount: 2,
        parsedCount: 1,
        suppressedCount: 1,
        failedCount: 0,
        manifestHash: HASH,
      },
    });
    const suppressed = new CollectionListingSuppressed({
      eventId: '0199c8f2-2394-7ba0-8f9e-286378779214',
      aggregateId: '0199c8f2-2394-7ba0-8f9e-286378779215',
      occurredAt: '2026-10-10T12:00:02Z',
      payload: { sourceId: 'synthetic-data', sourceListingId: 'SYN-001' },
    });

    expect([parsed.type, completed.type, suppressed.type]).toEqual([
      COLLECTION_SNAPSHOT_PARSED_TYPE,
      COLLECTION_RUN_COMPLETED_TYPE,
      COLLECTION_LISTING_SUPPRESSED_TYPE,
    ]);
    expect([parsed.version, completed.version, suppressed.version]).toEqual([1, 1, 1]);
    expect(parsed.aggregateId).toBe(parsed.payload.snapshot.snapshotId);
    expect(parsed.payload.listing.listedAt).toBe('2026-10-09T13:00:00.000Z');
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.payload.listing.imageFingerprints)).toBe(true);
  });

  it('hydrates every event from untyped JSON through the specific and aggregate parsers', () => {
    const parsed = new CollectionSnapshotParsed(parsedInput());
    const completed = new CollectionRunCompleted({
      eventId: '0199c8f2-2394-7ba0-8f9e-286378779213',
      aggregateId: RUN_ID,
      occurredAt: '2026-10-10T12:00:01Z',
      traceContext: {
        traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00',
        tracestate: 'vendor=opaque',
      },
      payload: {
        sourceId: 'synthetic-data',
        observedCount: 1,
        parsedCount: 1,
        suppressedCount: 0,
        failedCount: 0,
        manifestHash: HASH,
      },
    });
    const suppressed = new CollectionListingSuppressed({
      eventId: '0199c8f2-2394-7ba0-8f9e-286378779214',
      aggregateId: '0199c8f2-2394-7ba0-8f9e-286378779215',
      occurredAt: '2026-10-10T12:00:02Z',
      payload: { sourceId: 'synthetic-data', sourceListingId: 'SYN-001' },
    });

    expect(parseCollectionSnapshotParsed(wire(parsed))).toEqual(parsed);
    expect(parseCollectionRunCompleted(wire(completed))).toEqual(completed);
    expect(parseCollectionListingSuppressed(wire(suppressed))).toEqual(suppressed);
    expect(
      [parsed, completed, suppressed].map((event) => parseCollectionEvent(wire(event))),
    ).toEqual([parsed, completed, suppressed]);
  });

  it.each([
    ['extra envelope field', (value: MutableWireRecord) => (value.provider = 'vendor')],
    ['missing envelope field', (value: MutableWireRecord) => delete value.occurredAt],
    ['wrong version', (value: MutableWireRecord) => (value.version = COLLECTION_EVENT_VERSION + 1)],
    ['invalid event id', (value: MutableWireRecord) => (value.eventId = 'not-a-uuid')],
    ['invalid time', (value: MutableWireRecord) => (value.occurredAt = 'yesterday')],
    [
      'invalid hash',
      (value: MutableWireRecord) => {
        nested(value, 'payload', 'snapshot').contentHash = `sha256:${'A'.repeat(64)}`;
      },
    ],
    [
      'invalid URL',
      (value: MutableWireRecord) => {
        nested(value, 'payload', 'source').sourceUrl = '/relative';
      },
    ],
    [
      'invalid source identifier',
      (value: MutableWireRecord) => {
        nested(value, 'payload', 'source').sourceId = 'Vendor SDK';
      },
    ],
    [
      'invalid money',
      (value: MutableWireRecord) => {
        nested(value, 'payload', 'listing').askingPriceMinorUnits = -1;
      },
    ],
    [
      'invalid area',
      (value: MutableWireRecord) => {
        nested(value, 'payload', 'listing').areaSquareMeters = Number.POSITIVE_INFINITY;
      },
    ],
    [
      'invalid room count',
      (value: MutableWireRecord) => {
        nested(value, 'payload', 'listing').bedrooms = 1.5;
      },
    ],
    [
      'invalid property type',
      (value: MutableWireRecord) => {
        nested(value, 'payload', 'listing').propertyType = 'castle';
      },
    ],
    [
      'invalid currency',
      (value: MutableWireRecord) => {
        nested(value, 'payload', 'listing').currency = 'USD';
      },
    ],
    [
      'invalid state',
      (value: MutableWireRecord) => {
        nested(value, 'payload', 'listing', 'location').stateCode = 'sp';
      },
    ],
    [
      'duplicate feature',
      (value: MutableWireRecord) => {
        nested(value, 'payload', 'listing').features = ['pool', 'pool'];
      },
    ],
    [
      'empty fingerprints',
      (value: MutableWireRecord) => {
        nested(value, 'payload', 'listing').imageFingerprints = [];
      },
    ],
    [
      'private agency name',
      (value: MutableWireRecord) => {
        nested(value, 'payload', 'listing').advertiser = {
          type: 'private',
          agencyName: 'A Person',
        };
      },
    ],
  ])('rejects %s', (_name, mutate) => {
    const value = mutableParsedWire();
    mutate(value);
    expect(() => parseCollectionSnapshotParsed(value)).toThrow(DomainValidationError);
  });

  it.each(['HTTPS://example.com/listings/SYN-001', 'https://[2001:db8::1]/listings/SYN-001'])(
    'accepts valid absolute HTTP(S) source URL %s',
    (sourceUrl) => {
      const value = mutableParsedWire();
      nested(value, 'payload', 'source').sourceUrl = sourceUrl;

      expect(parseCollectionSnapshotParsed(value).payload.source.sourceUrl).toBe(sourceUrl);
    },
  );

  it.each([
    'https://example.com:99999/path',
    'https://user:secret@example.com/path',
    'mailto:listing@example.com',
  ])('rejects invalid or disallowed absolute source URL %s', (sourceUrl) => {
    const value = mutableParsedWire();
    nested(value, 'payload', 'source').sourceUrl = sourceUrl;

    expect(() => parseCollectionSnapshotParsed(value)).toThrow(DomainValidationError);
  });

  it.each([
    ['naturalPersonName', 'A Person'],
    ['phone', '+55 11 99999-9999'],
    ['email', 'person@example.test'],
    ['cpf', '123.456.789-00'],
    ['individualCreci', 'CRECI 12345'],
    ['unit', '42'],
    ['complement', 'Apartment 12'],
    ['imageUrl', 'https://images.invalid/a.jpg'],
    ['imageBinary', 'AAAA'],
    ['credentials', 'secret'],
    ['headers', { authorization: 'secret' }],
    ['vendorPayload', { id: 1 }],
  ])('rejects forbidden listing field %s', (field, forbiddenValue) => {
    const value = mutableParsedWire();
    nested(value, 'payload', 'listing')[field] = forbiddenValue;
    expect(() => parseCollectionEvent(value)).toThrow(DomainValidationError);
  });

  it.each([
    'Contact person@example.test',
    'Call +55 11 99999-9999',
    'CPF 123.456.789-00',
    'CPF 123 456 789 00',
    'See https://example.test/private',
    'Visit example.test/private',
    'UNMASKED CONTACT',
  ])('rejects unmasked description %s', (description) => {
    const value = mutableParsedWire();
    nested(value, 'payload', 'listing').maskedDescription = description;
    expect(() => parseCollectionEvent(value)).toThrow(DomainValidationError);
  });

  it('rejects mismatched snapshot identity, unknown type, and malformed trace context', () => {
    const mismatch = parsedInput();
    expect(
      () =>
        new CollectionSnapshotParsed({
          ...mismatch,
          aggregateId: '0199c8f2-2394-7ba0-8f9e-286378779299',
        }),
    ).toThrow(DomainValidationError);

    const unknown = mutableParsedWire();
    unknown.type = 'collection.snapshot.unknown';
    expect(() => parseCollectionEvent(unknown)).toThrow(DomainValidationError);

    const trace = mutableParsedWire();
    trace.traceContext = {
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00',
      provider: 'hidden',
    };
    expect(() => parseCollectionEvent(trace)).toThrow(DomainValidationError);
  });

  it('rejects impossible completion counts and extra suppression fields', () => {
    const completed = mutableRecord(
      wire(
        new CollectionRunCompleted({
          eventId: '0199c8f2-2394-7ba0-8f9e-286378779213',
          aggregateId: RUN_ID,
          occurredAt: '2026-10-10T12:00:01Z',
          payload: {
            sourceId: 'synthetic-data',
            observedCount: 1,
            parsedCount: 1,
            suppressedCount: 0,
            failedCount: 0,
            manifestHash: HASH,
          },
        }),
      ),
    );
    nested(completed, 'payload').failedCount = 1;
    expect(() => parseCollectionRunCompleted(completed)).toThrow(DomainValidationError);

    const suppressed = mutableRecord(
      wire(
        new CollectionListingSuppressed({
          eventId: '0199c8f2-2394-7ba0-8f9e-286378779214',
          aggregateId: '0199c8f2-2394-7ba0-8f9e-286378779215',
          occurredAt: '2026-10-10T12:00:02Z',
          payload: { sourceId: 'synthetic-data', sourceListingId: 'SYN-001' },
        }),
      ),
    );
    nested(suppressed, 'payload').reason = 'provider detail';
    expect(() => parseCollectionListingSuppressed(suppressed)).toThrow(DomainValidationError);
  });
});
