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
import { maskSnapshotText } from './snapshot-text-privacy.js';

export const COLLECTION_SNAPSHOT_PARSED_TYPE = 'collection.snapshot.parsed' as const;
export const COLLECTION_RUN_REQUESTED_TYPE = 'collection.run.requested' as const;
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

export type CollectionRunRequestedPayload = Readonly<{
  readonly sourceId: string;
  readonly scheduledFor: string;
  readonly operationKey: string;
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
export type CollectionRunRequestedInput = CollectionEventInput<
  typeof COLLECTION_RUN_REQUESTED_TYPE,
  CollectionRunRequestedPayload
>;
export type CollectionListingSuppressedInput = CollectionEventInput<
  typeof COLLECTION_LISTING_SUPPRESSED_TYPE,
  CollectionListingSuppressedPayload
>;

/** Canonical idempotency key for one source's scheduled UTC slot. */
export function collectionRunOperationKey(
  sourceIdValue: string,
  scheduledForValue: string,
): string {
  const canonicalSourceId = sourceId(sourceIdValue, 'sourceId');
  const canonicalScheduledFor = parseRfc3339Timestamp(scheduledForValue, 'scheduledFor');
  return `collection:${canonicalSourceId}:${canonicalScheduledFor}`;
}

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

function maskedText(value: unknown, field: string, maximumLength = 500): string {
  const parsed = stringValue(value, field, maximumLength);
  if (maskSnapshotText(parsed) !== parsed) {
    return fail(`${field} contains unmasked contact data or a link.`, field);
  }
  return parsed;
}

function stringArray(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value) || value.length > 100) {
    return fail(`${field} must be an array with at most 100 entries.`, field);
  }
  const result = value.map((item, index) => maskedText(item, `${field}[${index}]`, 100));
  if (new Set(result).size !== result.length) {
    return fail(`${field} must not contain duplicate values.`, field);
  }
  return result;
}

export function parseImageFingerprints(
  value: unknown,
  allowEmpty = true,
  perceptual = false,
): readonly string[] {
  const field = 'payload.listing.imageFingerprints';
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || value.length > 100) {
    return fail(`${field} must contain between 1 and 100 fingerprints.`, field);
  }
  const result = value.map((item, index) => {
    const itemField = `${field}[${index}]`;
    const fingerprint = stringValue(item, itemField, 1_000);
    if (
      !(perceptual && /^dhash64-v1:[a-f0-9]{16}$/.test(fingerprint)) &&
      !/^sha256:[a-f0-9]{64}$/.test(fingerprint) &&
      !/^(?:fixture|synthetic)(?:[-:][a-z0-9]{1,32}){1,8}$/.test(fingerprint)
    ) {
      return fail(
        `${itemField} must be a SHA-256 hash or a prepared synthetic fingerprint.`,
        itemField,
      );
    }
    return fingerprint;
  });
  if (
    new Set(result.filter((item) => !perceptual || !item.startsWith('dhash64-v1:'))).size !==
    result.filter((item) => !perceptual || !item.startsWith('dhash64-v1:')).length
  ) {
    return fail(`${field} must not contain duplicate fingerprints.`, field);
  }
  return result;
}

function maskedDescription(value: unknown): string {
  return maskedText(value, 'payload.listing.maskedDescription', 20_000);
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
  const street = maskedText(parsed.street, 'payload.listing.location.street', 300);
  if (
    /\b(?:apartamento|apto|apt|ap|apartment|unit|unidade|sala|conjunto|cj|bloco|block|complemento|complement)\b\.?\s*(?:n[º°o.]?|#|:|-)?\s*(?:\d|[a-z]\b)/iu.test(
      street,
    ) ||
    /[,;]\s*(?:apartamento|apto|apt|ap|apartment|unit|unidade|sala|conjunto|cj|bloco|block|complemento|complement|fundos)\b/iu.test(
      street,
    ) ||
    /\b\d+\s+fundos\b/iu.test(street)
  ) {
    return fail(
      'payload.listing.location.street contains unit or complement details.',
      'payload.listing.location.street',
    );
  }
  return {
    city: maskedText(parsed.city, 'payload.listing.location.city', 200),
    stateCode,
    neighborhood: maskedText(parsed.neighborhood, 'payload.listing.location.neighborhood', 200),
    street,
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
    agencyName: maskedText(parsed.agencyName, 'payload.listing.advertiser.agencyName', 300),
  };
}

export function parseCollectedListing(
  value: unknown,
  allowEmptyFingerprints = false,
  perceptual = false,
): CollectedListing {
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
    imageFingerprints: parseImageFingerprints(
      parsed.imageFingerprints,
      allowEmptyFingerprints,
      perceptual,
    ),
  };
}

function parseSnapshotPayload(
  value: unknown,
  allowEmptyFingerprints = false,
  perceptual = false,
): CollectionSnapshotParsedPayload {
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
      sourceListingId: maskedText(source.sourceListingId, 'payload.source.sourceListingId', 300),
      sourceUrl: absoluteHttpUrl(source.sourceUrl, 'payload.source.sourceUrl'),
      observedAt: parseRfc3339Timestamp(
        stringValue(source.observedAt, 'payload.source.observedAt'),
        'payload.source.observedAt',
      ),
    },
    listing: parseCollectedListing(parsed.listing, allowEmptyFingerprints, perceptual),
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

function parseRequestedPayload(value: unknown): CollectionRunRequestedPayload {
  const parsed = exactRecord(value, ['sourceId', 'scheduledFor', 'operationKey'], 'payload');
  const parsedSourceId = sourceId(parsed.sourceId, 'payload.sourceId');
  const scheduledFor = parseRfc3339Timestamp(
    stringValue(parsed.scheduledFor, 'payload.scheduledFor'),
    'payload.scheduledFor',
  );
  const operationKey = stringValue(parsed.operationKey, 'payload.operationKey', 200);
  if (operationKey !== collectionRunOperationKey(parsedSourceId, scheduledFor)) {
    return fail(
      'payload.operationKey must match the source and scheduled UTC instant.',
      'payload.operationKey',
    );
  }
  return {
    sourceId: parsedSourceId,
    scheduledFor,
    operationKey,
  };
}

function parseSuppressedPayload(value: unknown): CollectionListingSuppressedPayload {
  const parsed = exactRecord(value, ['sourceId', 'sourceListingId'], 'payload');
  return {
    sourceId: sourceId(parsed.sourceId, 'payload.sourceId'),
    sourceListingId: maskedText(parsed.sourceListingId, 'payload.sourceListingId', 300),
  };
}

function envelope(
  value: unknown,
  expectedType: string,
  expectedVersion = COLLECTION_EVENT_VERSION as number,
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
  if (parsed.version !== expectedVersion) return fail('Event version is not supported.', 'version');
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
  public constructor(input: CollectionSnapshotParsedInput, version: 1 | 3 = 1) {
    const payload = parseSnapshotPayload(input.payload, version === 3, version === 3);
    const aggregateId = parseUuidV7(input.aggregateId);
    if (aggregateId !== payload.snapshot.snapshotId) {
      fail('Parsed snapshot aggregateId must equal payload.snapshot.snapshotId.', 'aggregateId');
    }
    super({
      ...input,
      aggregateId,
      type: COLLECTION_SNAPSHOT_PARSED_TYPE,
      version,
      traceContext: input.traceContext ?? null,
      payload,
    });
  }
}

/** Acquisition with empty or versioned perceptual evidence; legacy v1 stays strict. */
export class CollectionSnapshotAcquired extends CollectionSnapshotParsed {
  public constructor(input: CollectionSnapshotParsedInput) {
    super(input, 3);
  }
}

export type CollectionSnapshotCorrectedPayload = CollectionSnapshotParsedPayload &
  Readonly<{
    correction: Readonly<{
      kind: 'parser-correction';
      operationKey: string;
      parserRevision: string;
      originalParsedEventId: UuidV7;
      order: number;
    }>;
  }>;

export function parseReparseLabel(value: unknown, field: string): string {
  const parsed = stringValue(value, field, 200);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(parsed))
    return fail(`${field} must be a safe artifact identifier.`, field);
  return parsed;
}

function parseCorrectionPayload(
  value: unknown,
  perceptual = false,
): CollectionSnapshotCorrectedPayload {
  const parsed = exactRecord(
    value,
    ['run', 'snapshot', 'source', 'listing', 'correction'],
    'payload',
  );
  const correction = exactRecord(
    parsed.correction,
    ['kind', 'operationKey', 'parserRevision', 'originalParsedEventId', 'order'],
    'payload.correction',
  );
  if (correction.kind !== 'parser-correction')
    fail('Unsupported correction marker.', 'payload.correction.kind');
  const original = parseSnapshotPayload(
    { run: parsed.run, snapshot: parsed.snapshot, source: parsed.source, listing: parsed.listing },
    true,
    perceptual,
  );
  return {
    ...original,
    correction: {
      kind: 'parser-correction',
      operationKey: parseReparseLabel(correction.operationKey, 'payload.correction.operationKey'),
      parserRevision: parseReparseLabel(
        correction.parserRevision,
        'payload.correction.parserRevision',
      ),
      originalParsedEventId: parseUuidV7(
        stringValue(correction.originalParsedEventId, 'payload.correction.originalParsedEventId'),
      ),
      order: boundedNumber(
        correction.order,
        'payload.correction.order',
        1,
        Number.MAX_SAFE_INTEGER,
        true,
      ),
    },
  };
}

/** A parser correction references an existing observation and never creates market history. */
export class CollectionSnapshotCorrected extends DomainEvent<
  typeof COLLECTION_SNAPSHOT_PARSED_TYPE,
  CollectionSnapshotCorrectedPayload
> {
  public constructor(
    input: CollectionEventInput<
      typeof COLLECTION_SNAPSHOT_PARSED_TYPE,
      CollectionSnapshotCorrectedPayload
    >,
    version: 2 | 4 = 2,
  ) {
    const payload = parseCorrectionPayload(input.payload, version === 4);
    if (parseUuidV7(input.aggregateId) !== payload.snapshot.snapshotId)
      fail('Correction aggregate must identify the original snapshot.', 'aggregateId');
    if (parseUuidV7(input.eventId) === payload.correction.originalParsedEventId)
      fail('Correction must have a new event identity.', 'eventId');
    super({
      ...input,
      type: COLLECTION_SNAPSHOT_PARSED_TYPE,
      version,
      traceContext: input.traceContext ?? null,
      payload,
    });
  }
}

/** Perceptual correction retains its acquisition hashes and multiplicity. */
export class CollectionSnapshotPerceptuallyCorrected extends CollectionSnapshotCorrected {
  public constructor(
    input: CollectionEventInput<
      typeof COLLECTION_SNAPSHOT_PARSED_TYPE,
      CollectionSnapshotCorrectedPayload
    >,
  ) {
    super(input, 4);
  }
}

export function parseCollectionSnapshotAcquired(value: unknown): CollectionSnapshotAcquired {
  const parsed = envelope(value, COLLECTION_SNAPSHOT_PARSED_TYPE, 3);
  return new CollectionSnapshotAcquired({
    ...parsed,
    payload: parseSnapshotPayload(parsed.payload, true, true),
  });
}

export function parseCollectionSnapshotPerceptuallyCorrected(
  value: unknown,
): CollectionSnapshotPerceptuallyCorrected {
  const parsed = envelope(value, COLLECTION_SNAPSHOT_PARSED_TYPE, 4);
  return new CollectionSnapshotPerceptuallyCorrected({
    ...parsed,
    payload: parseCorrectionPayload(parsed.payload, true),
  });
}

export function parseCollectionSnapshotCorrected(value: unknown): CollectionSnapshotCorrected {
  const parsed = envelope(value, COLLECTION_SNAPSHOT_PARSED_TYPE, 2);
  return new CollectionSnapshotCorrected({
    ...parsed,
    payload: parseCorrectionPayload(parsed.payload),
  });
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

export class CollectionRunRequested extends DomainEvent<
  typeof COLLECTION_RUN_REQUESTED_TYPE,
  CollectionRunRequestedPayload
> {
  public constructor(input: CollectionRunRequestedInput) {
    const payload = parseRequestedPayload(input.payload);
    super({
      ...input,
      type: COLLECTION_RUN_REQUESTED_TYPE,
      version: COLLECTION_EVENT_VERSION,
      traceContext: input.traceContext ?? null,
      payload,
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
  | CollectionSnapshotCorrected
  | CollectionRunRequested
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

export function parseCollectionRunRequested(value: unknown): CollectionRunRequested {
  const parsed = envelope(value, COLLECTION_RUN_REQUESTED_TYPE);
  return new CollectionRunRequested({ ...parsed, payload: parseRequestedPayload(parsed.payload) });
}

export function parseCollectionListingSuppressed(value: unknown): CollectionListingSuppressed {
  const parsed = envelope(value, COLLECTION_LISTING_SUPPRESSED_TYPE);
  return new CollectionListingSuppressed({
    ...parsed,
    payload: parseSuppressedPayload(parsed.payload),
  });
}

/** Hydrates the public version-1 collection facts from an untyped wire value. */
export function parseCollectionEvent(value: unknown): CollectionEvent {
  const parsed = record(value, 'event');
  switch (parsed.type) {
    case COLLECTION_SNAPSHOT_PARSED_TYPE:
      switch (parsed.version) {
        case 1:
          return parseCollectionSnapshotParsed(value);
        case 2:
          return parseCollectionSnapshotCorrected(value);
        case 3:
          return parseCollectionSnapshotAcquired(value);
        case 4:
          return parseCollectionSnapshotPerceptuallyCorrected(value);
        default:
          return fail('Event version is not supported.', 'version');
      }
    case COLLECTION_RUN_COMPLETED_TYPE:
      return parseCollectionRunCompleted(value);
    case COLLECTION_RUN_REQUESTED_TYPE:
      return parseCollectionRunRequested(value);
    case COLLECTION_LISTING_SUPPRESSED_TYPE:
      return parseCollectionListingSuppressed(value);
    default:
      return fail('Event type is not supported.', 'type');
  }
}
