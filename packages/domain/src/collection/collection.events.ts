import {
  DomainEvent,
  DomainValidationError,
  parseRfc3339Timestamp,
  parseUuidV7,
  type DomainEventInput,
  type TraceContext,
  type UuidV7,
} from '../shared/index.js';
import { parseSha256Hash, type Sha256Hash } from './sha256-hash.js';

export const COLLECTION_SNAPSHOT_PARSED_TYPE = 'collection.snapshot.parsed' as const;
export const COLLECTION_RUN_COMPLETED_TYPE = 'collection.run.completed' as const;
export const COLLECTION_LISTING_SUPPRESSED_TYPE = 'collection.listing.suppressed' as const;
export const COLLECTION_EVENT_VERSION = 1 as const;

export const COLLECTION_PROPERTY_TYPES = [
  'apartment',
  'house',
  'condominium',
  'land',
  'commercial',
  'other',
] as const;
export type CollectionPropertyType = (typeof COLLECTION_PROPERTY_TYPES)[number];

export const COLLECTION_ADVERTISER_TYPES = ['private', 'agency'] as const;
export type CollectionAdvertiserType = (typeof COLLECTION_ADVERTISER_TYPES)[number];

export type CollectionRunProvenance = Readonly<{
  readonly runId: UuidV7;
}>;

export type CollectionSnapshotProvenance = Readonly<{
  readonly snapshotId: UuidV7;
  readonly contentHash: Sha256Hash;
}>;

export type CollectionSourceProvenance = Readonly<{
  readonly sourceId: string;
  readonly sourceListingId: string;
  readonly sourceUrl: string;
  readonly observedAt: string;
}>;

export type CollectedListingLocation = Readonly<{
  readonly city: string;
  readonly stateCode: string;
  readonly neighborhood: string;
  readonly street: string;
}>;

export type CollectedListingAdvertiser = Readonly<{
  readonly type: CollectionAdvertiserType;
  readonly agencyName: string | null;
}>;

/** Closed, privacy-reviewed listing shape that may leave collection. */
export type CollectedListing = Readonly<{
  readonly propertyType: CollectionPropertyType;
  readonly askingPriceMinorUnits: number;
  readonly currency: 'BRL';
  readonly areaSquareMeters: number;
  readonly bedrooms: number;
  readonly bathrooms: number;
  readonly parkingSpaces: number;
  readonly features: readonly string[];
  readonly location: CollectedListingLocation;
  readonly listedAt: string;
  readonly advertiser: CollectedListingAdvertiser;
  readonly maskedDescription: string;
  readonly imageFingerprints: readonly string[];
}>;

export type CollectionSnapshotParsedPayload = Readonly<{
  readonly run: CollectionRunProvenance;
  readonly snapshot: CollectionSnapshotProvenance;
  readonly source: CollectionSourceProvenance;
  readonly listing: CollectedListing;
}>;

export type CollectionRunCompletedPayload = Readonly<{
  readonly sourceId: string;
  readonly observedCount: number;
  readonly parsedCount: number;
  readonly suppressedCount: number;
  readonly failedCount: number;
  readonly manifestHash: Sha256Hash;
}>;

export type CollectionListingSuppressedPayload = Readonly<{
  readonly sourceId: string;
  readonly sourceListingId: string;
}>;

type CollectionEventInput<TType extends string, TPayload extends object> = Omit<
  DomainEventInput<TType, TPayload>,
  'type' | 'version'
> & {
  readonly traceContext?: TraceContext | null;
};

export type CollectionSnapshotParsedInput = CollectionEventInput<
  typeof COLLECTION_SNAPSHOT_PARSED_TYPE,
  CollectionSnapshotParsedPayload
>;
export type CollectionRunCompletedInput = CollectionEventInput<
  typeof COLLECTION_RUN_COMPLETED_TYPE,
  CollectionRunCompletedPayload
>;
export type CollectionListingSuppressedInput = CollectionEventInput<
  typeof COLLECTION_LISTING_SUPPRESSED_TYPE,
  CollectionListingSuppressedPayload
>;

function fail(message: string, field: string): never {
  throw new DomainValidationError(message, field);
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail(`${field} must be an object.`, field);
  }
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    return fail(`${field} must be a plain object.`, field);
  }
  return value as Record<string, unknown>;
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  field: string,
): Record<string, unknown> {
  const result = record(value, field);
  const actualKeys = Object.keys(result).sort();
  const expectedKeys = [...keys].sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    return fail(`${field} contains missing or unexpected fields.`, field);
  }
  return result;
}

function stringValue(value: unknown, field: string, maximumLength = 500): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximumLength) {
    return fail(
      `${field} must be a non-empty string of at most ${maximumLength} characters.`,
      field,
    );
  }
  return value;
}

function sourceId(value: unknown, field: string): string {
  const parsed = stringValue(value, field, 100);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(parsed)) {
    return fail(`${field} must be a lower-kebab source identifier.`, field);
  }
  return parsed;
}

function absoluteHttpUrl(value: unknown, field: string): string {
  const parsed = stringValue(value, field, 2_048);
  const RuntimeUrl = Reflect.get(globalThis, 'URL') as new (input: string) => {
    readonly protocol: string;
    readonly username: string;
    readonly password: string;
  };
  let url: InstanceType<typeof RuntimeUrl>;
  try {
    url = new RuntimeUrl(parsed);
  } catch {
    return fail(`${field} must be an absolute HTTP(S) URL without credentials.`, field);
  }
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username.length > 0 ||
    url.password.length > 0
  ) {
    return fail(`${field} must be an absolute HTTP(S) URL without credentials.`, field);
  }
  return parsed;
}

function boundedNumber(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
  integer: boolean,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum ||
    (integer && !Number.isSafeInteger(value))
  ) {
    return fail(`${field} is outside its accepted numeric range.`, field);
  }
  return value;
}

function stringArray(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value) || value.length > 100) {
    return fail(`${field} must be an array with at most 100 entries.`, field);
  }
  const result = value.map((item, index) => stringValue(item, `${field}[${index}]`, 100));
  if (new Set(result).size !== result.length) {
    return fail(`${field} must not contain duplicate values.`, field);
  }
  return result;
}

function fingerprints(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
    return fail(`${field} must contain between 1 and 100 fingerprints.`, field);
  }
  const result = value.map((item, index) => stringValue(item, `${field}[${index}]`, 1_000));
  if (new Set(result).size !== result.length) {
    return fail(`${field} must not contain duplicate fingerprints.`, field);
  }
  return result;
}

function maskedDescription(value: unknown): string {
  const parsed = stringValue(value, 'payload.listing.maskedDescription', 20_000);
  const containsEmail = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(parsed);
  const containsCpf = /\b\d{3}[\s.]?\d{3}[\s.]?\d{3}[\s-]?\d{2}\b/.test(parsed);
  const containsPhone = /(?:\+?55\s*)?(?:\(?\d{2}\)?[\s.-]*)?\d{4,5}[\s.-]*\d{4}/.test(parsed);
  const containsLink =
    /(?:https?:\/\/|www\.)\S+/i.test(parsed) ||
    /\b(?:[a-z0-9-]+\.)+[a-z]{2,63}(?:[/?#][^\s]*)?/i.test(parsed);
  const containsSentinel = /\bunmasked\b/i.test(parsed);
  if (containsEmail || containsCpf || containsPhone || containsLink || containsSentinel) {
    return fail(
      'payload.listing.maskedDescription contains unmasked contact data or a link.',
      'payload.listing.maskedDescription',
    );
  }
  return parsed;
}

function parseTraceContext(value: unknown): TraceContext | null {
  if (value === null) return null;
  const parsed = record(value, 'traceContext');
  const keys = Object.keys(parsed).sort();
  const expected =
    parsed.tracestate === undefined ? ['traceparent'] : ['traceparent', 'tracestate'];
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    return fail('traceContext contains missing or unexpected fields.', 'traceContext');
  }
  if (typeof parsed.traceparent !== 'string') {
    return fail('traceContext.traceparent must be a string.', 'traceContext.traceparent');
  }
  if (parsed.tracestate !== undefined && typeof parsed.tracestate !== 'string') {
    return fail('traceContext.tracestate must be a string.', 'traceContext.tracestate');
  }
  return parsed.tracestate === undefined
    ? { traceparent: parsed.traceparent }
    : { traceparent: parsed.traceparent, tracestate: parsed.tracestate };
}

function parseLocation(value: unknown): CollectedListingLocation {
  const parsed = exactRecord(
    value,
    ['city', 'stateCode', 'neighborhood', 'street'],
    'payload.listing.location',
  );
  const stateCode = stringValue(parsed.stateCode, 'payload.listing.location.stateCode', 2);
  if (!/^[A-Z]{2}$/.test(stateCode)) {
    return fail(
      'payload.listing.location.stateCode must be a two-letter code.',
      'payload.listing.location.stateCode',
    );
  }
  return {
    city: stringValue(parsed.city, 'payload.listing.location.city', 200),
    stateCode,
    neighborhood: stringValue(parsed.neighborhood, 'payload.listing.location.neighborhood', 200),
    street: stringValue(parsed.street, 'payload.listing.location.street', 300),
  };
}

function parseAdvertiser(value: unknown): CollectedListingAdvertiser {
  const parsed = exactRecord(value, ['type', 'agencyName'], 'payload.listing.advertiser');
  if (
    typeof parsed.type !== 'string' ||
    !COLLECTION_ADVERTISER_TYPES.includes(parsed.type as CollectionAdvertiserType)
  ) {
    return fail(
      'payload.listing.advertiser.type is unsupported.',
      'payload.listing.advertiser.type',
    );
  }
  if (parsed.type === 'private') {
    if (parsed.agencyName !== null) {
      return fail(
        'A private advertiser cannot carry an agency name.',
        'payload.listing.advertiser.agencyName',
      );
    }
    return { type: 'private', agencyName: null };
  }
  return {
    type: 'agency',
    agencyName: stringValue(parsed.agencyName, 'payload.listing.advertiser.agencyName', 300),
  };
}

function parseListing(value: unknown): CollectedListing {
  const parsed = exactRecord(
    value,
    [
      'propertyType',
      'askingPriceMinorUnits',
      'currency',
      'areaSquareMeters',
      'bedrooms',
      'bathrooms',
      'parkingSpaces',
      'features',
      'location',
      'listedAt',
      'advertiser',
      'maskedDescription',
      'imageFingerprints',
    ],
    'payload.listing',
  );
  if (
    typeof parsed.propertyType !== 'string' ||
    !COLLECTION_PROPERTY_TYPES.includes(parsed.propertyType as CollectionPropertyType)
  ) {
    return fail('payload.listing.propertyType is unsupported.', 'payload.listing.propertyType');
  }
  if (parsed.currency !== 'BRL') {
    return fail('payload.listing.currency must be BRL.', 'payload.listing.currency');
  }
  return {
    propertyType: parsed.propertyType as CollectionPropertyType,
    askingPriceMinorUnits: boundedNumber(
      parsed.askingPriceMinorUnits,
      'payload.listing.askingPriceMinorUnits',
      1,
      Number.MAX_SAFE_INTEGER,
      true,
    ),
    currency: 'BRL',
    areaSquareMeters: boundedNumber(
      parsed.areaSquareMeters,
      'payload.listing.areaSquareMeters',
      0.01,
      1_000_000,
      false,
    ),
    bedrooms: boundedNumber(parsed.bedrooms, 'payload.listing.bedrooms', 0, 100, true),
    bathrooms: boundedNumber(parsed.bathrooms, 'payload.listing.bathrooms', 0, 100, true),
    parkingSpaces: boundedNumber(
      parsed.parkingSpaces,
      'payload.listing.parkingSpaces',
      0,
      100,
      true,
    ),
    features: stringArray(parsed.features, 'payload.listing.features'),
    location: parseLocation(parsed.location),
    listedAt: parseRfc3339Timestamp(
      stringValue(parsed.listedAt, 'payload.listing.listedAt'),
      'payload.listing.listedAt',
    ),
    advertiser: parseAdvertiser(parsed.advertiser),
    maskedDescription: maskedDescription(parsed.maskedDescription),
    imageFingerprints: fingerprints(parsed.imageFingerprints, 'payload.listing.imageFingerprints'),
  };
}

function parseSnapshotPayload(value: unknown): CollectionSnapshotParsedPayload {
  const parsed = exactRecord(value, ['run', 'snapshot', 'source', 'listing'], 'payload');
  const run = exactRecord(parsed.run, ['runId'], 'payload.run');
  const snapshot = exactRecord(parsed.snapshot, ['snapshotId', 'contentHash'], 'payload.snapshot');
  const source = exactRecord(
    parsed.source,
    ['sourceId', 'sourceListingId', 'sourceUrl', 'observedAt'],
    'payload.source',
  );
  return {
    run: { runId: parseUuidV7(stringValue(run.runId, 'payload.run.runId')) },
    snapshot: {
      snapshotId: parseUuidV7(stringValue(snapshot.snapshotId, 'payload.snapshot.snapshotId')),
      contentHash: parseSha256Hash(
        stringValue(snapshot.contentHash, 'payload.snapshot.contentHash'),
        'payload.snapshot.contentHash',
      ),
    },
    source: {
      sourceId: sourceId(source.sourceId, 'payload.source.sourceId'),
      sourceListingId: stringValue(source.sourceListingId, 'payload.source.sourceListingId', 300),
      sourceUrl: absoluteHttpUrl(source.sourceUrl, 'payload.source.sourceUrl'),
      observedAt: parseRfc3339Timestamp(
        stringValue(source.observedAt, 'payload.source.observedAt'),
        'payload.source.observedAt',
      ),
    },
    listing: parseListing(parsed.listing),
  };
}

function count(value: unknown, field: string): number {
  return boundedNumber(value, field, 0, Number.MAX_SAFE_INTEGER, true);
}

function parseRunPayload(value: unknown): CollectionRunCompletedPayload {
  const parsed = exactRecord(
    value,
    ['sourceId', 'observedCount', 'parsedCount', 'suppressedCount', 'failedCount', 'manifestHash'],
    'payload',
  );
  const result = {
    sourceId: sourceId(parsed.sourceId, 'payload.sourceId'),
    observedCount: count(parsed.observedCount, 'payload.observedCount'),
    parsedCount: count(parsed.parsedCount, 'payload.parsedCount'),
    suppressedCount: count(parsed.suppressedCount, 'payload.suppressedCount'),
    failedCount: count(parsed.failedCount, 'payload.failedCount'),
    manifestHash: parseSha256Hash(
      stringValue(parsed.manifestHash, 'payload.manifestHash'),
      'payload.manifestHash',
    ),
  };
  if (result.parsedCount + result.suppressedCount + result.failedCount > result.observedCount) {
    return fail('Run outcome counts cannot exceed the observed count.', 'payload');
  }
  return result;
}

function parseSuppressedPayload(value: unknown): CollectionListingSuppressedPayload {
  const parsed = exactRecord(value, ['sourceId', 'sourceListingId'], 'payload');
  return {
    sourceId: sourceId(parsed.sourceId, 'payload.sourceId'),
    sourceListingId: stringValue(parsed.sourceListingId, 'payload.sourceListingId', 300),
  };
}

function envelope(
  value: unknown,
  expectedType: string,
): {
  readonly eventId: string;
  readonly aggregateId: string;
  readonly occurredAt: string;
  readonly traceContext: TraceContext | null;
  readonly payload: unknown;
} {
  const parsed = exactRecord(
    value,
    ['eventId', 'type', 'version', 'aggregateId', 'occurredAt', 'traceContext', 'payload'],
    'event',
  );
  if (parsed.type !== expectedType) return fail('Event type is not supported.', 'type');
  if (parsed.version !== COLLECTION_EVENT_VERSION)
    return fail('Event version is not supported.', 'version');
  return {
    eventId: stringValue(parsed.eventId, 'eventId'),
    aggregateId: stringValue(parsed.aggregateId, 'aggregateId'),
    occurredAt: stringValue(parsed.occurredAt, 'occurredAt'),
    traceContext: parseTraceContext(parsed.traceContext),
    payload: parsed.payload,
  };
}

export class CollectionSnapshotParsed extends DomainEvent<
  typeof COLLECTION_SNAPSHOT_PARSED_TYPE,
  CollectionSnapshotParsedPayload
> {
  public constructor(input: CollectionSnapshotParsedInput) {
    const payload = parseSnapshotPayload(input.payload);
    const aggregateId = parseUuidV7(input.aggregateId);
    if (aggregateId !== payload.snapshot.snapshotId) {
      fail('Parsed snapshot aggregateId must equal payload.snapshot.snapshotId.', 'aggregateId');
    }
    super({
      ...input,
      aggregateId,
      type: COLLECTION_SNAPSHOT_PARSED_TYPE,
      version: COLLECTION_EVENT_VERSION,
      traceContext: input.traceContext ?? null,
      payload,
    });
  }
}

export class CollectionRunCompleted extends DomainEvent<
  typeof COLLECTION_RUN_COMPLETED_TYPE,
  CollectionRunCompletedPayload
> {
  public constructor(input: CollectionRunCompletedInput) {
    super({
      ...input,
      type: COLLECTION_RUN_COMPLETED_TYPE,
      version: COLLECTION_EVENT_VERSION,
      traceContext: input.traceContext ?? null,
      payload: parseRunPayload(input.payload),
    });
  }
}

export class CollectionListingSuppressed extends DomainEvent<
  typeof COLLECTION_LISTING_SUPPRESSED_TYPE,
  CollectionListingSuppressedPayload
> {
  public constructor(input: CollectionListingSuppressedInput) {
    super({
      ...input,
      type: COLLECTION_LISTING_SUPPRESSED_TYPE,
      version: COLLECTION_EVENT_VERSION,
      traceContext: input.traceContext ?? null,
      payload: parseSuppressedPayload(input.payload),
    });
  }
}

export type CollectionEvent =
  | CollectionSnapshotParsed
  | CollectionRunCompleted
  | CollectionListingSuppressed;

export function parseCollectionSnapshotParsed(value: unknown): CollectionSnapshotParsed {
  const parsed = envelope(value, COLLECTION_SNAPSHOT_PARSED_TYPE);
  return new CollectionSnapshotParsed({
    ...parsed,
    payload: parseSnapshotPayload(parsed.payload),
  });
}

export function parseCollectionRunCompleted(value: unknown): CollectionRunCompleted {
  const parsed = envelope(value, COLLECTION_RUN_COMPLETED_TYPE);
  return new CollectionRunCompleted({ ...parsed, payload: parseRunPayload(parsed.payload) });
}

export function parseCollectionListingSuppressed(value: unknown): CollectionListingSuppressed {
  const parsed = envelope(value, COLLECTION_LISTING_SUPPRESSED_TYPE);
  return new CollectionListingSuppressed({
    ...parsed,
    payload: parseSuppressedPayload(parsed.payload),
  });
}

/** Hydrates only the three public version-1 collection facts from an untyped wire value. */
export function parseCollectionEvent(value: unknown): CollectionEvent {
  const parsed = record(value, 'event');
  switch (parsed.type) {
    case COLLECTION_SNAPSHOT_PARSED_TYPE:
      return parseCollectionSnapshotParsed(value);
    case COLLECTION_RUN_COMPLETED_TYPE:
      return parseCollectionRunCompleted(value);
    case COLLECTION_LISTING_SUPPRESSED_TYPE:
      return parseCollectionListingSuppressed(value);
    default:
      return fail('Event type is not supported.', 'type');
  }
}
