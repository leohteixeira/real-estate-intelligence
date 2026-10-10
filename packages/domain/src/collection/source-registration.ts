export const SOURCE_CATEGORIES = [
  'synthetic-listing',
  'listing',
  'reference-geography',
  'cadastral-file',
  'transaction',
] as const;
export type SourceCategory = (typeof SOURCE_CATEGORIES)[number];

export const SOURCE_REVIEW_OUTCOMES = [
  'not-required',
  'allowed',
  'forbidden',
  'not-verified',
] as const;
export type SourceReviewOutcome = (typeof SOURCE_REVIEW_OUTCOMES)[number];

export const SOURCE_ACCESS_METHODS = [
  'repository-fixture',
  'remote-http',
  'manual-download',
] as const;
export type SourceAccessMethod = (typeof SOURCE_ACCESS_METHODS)[number];

export interface SourcePermissions {
  readonly collectionAllowed: boolean;
  readonly imageFetchingAllowed: boolean;
  readonly listingTextDisplayAllowed: boolean;
}

export interface SourceReview {
  readonly outcome: SourceReviewOutcome;
  readonly reviewedAt: string | null;
  readonly evidence: string;
}

export interface SourceAccessPolicy {
  readonly method: SourceAccessMethod;
  readonly detail: string;
}

export type SourceRatePolicy =
  | { readonly status: 'not-applicable'; readonly limit: null; readonly windowSeconds: null }
  | { readonly status: 'unconfigured'; readonly limit: null; readonly windowSeconds: null }
  | { readonly status: 'configured'; readonly limit: number; readonly windowSeconds: number };

export type SourceLicence =
  | { readonly status: 'licensed'; readonly label: string; readonly url: string }
  | { readonly status: 'not-verified'; readonly label: null; readonly url: null }
  | { readonly status: 'not-applicable'; readonly label: string; readonly url: null };

export interface SourceRegistrationInput {
  readonly sourceId: string;
  readonly displayLabel: string;
  readonly category: SourceCategory;
  readonly enabled: boolean;
  readonly enabledAt: string | null;
  readonly permissions: SourcePermissions;
  readonly review: SourceReview;
  readonly access: SourceAccessPolicy;
  readonly rate: SourceRatePolicy;
  readonly licence: SourceLicence;
}

export type SourceRegistration = Readonly<SourceRegistrationInput>;

export type SourceEnableRefusalCode =
  | 'collection-not-allowed'
  | 'review-forbidden'
  | 'review-not-verified'
  | 'review-not-allowed'
  | 'licence-not-verified'
  | 'remote-access-required'
  | 'rate-unconfigured'
  | 'rate-not-applicable';

export type SourceEnableDecision =
  | { readonly eligible: true }
  | { readonly eligible: false; readonly code: SourceEnableRefusalCode };

export interface EnabledSourceView {
  readonly sourceId: string;
  readonly displayLabel: string;
  readonly enabled: true;
  readonly permissions: SourcePermissions;
  readonly licence: SourceLicence;
}

const SOURCE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const DNS_LABEL = '[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?';
const TCP_PORT =
  '(?:[0-9]{1,4}|[0-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5])';
const URL_SUFFIX_CHARACTERS = "[A-Za-z0-9._~:/?#@!$&'()*+,;=%-]";
const LICENCE_URL = new RegExp(
  `^https?://(${DNS_LABEL}(?:\\.${DNS_LABEL})*)(?::${TCP_PORT})?(?:[/?#]${URL_SUFFIX_CHARACTERS}*)?$`,
  'i',
);
const MAX_LICENCE_URL_LENGTH = 2_048;
const MAX_DNS_HOSTNAME_LENGTH = 253;

function bounded(value: string, name: string, maximum: number): string {
  if (value.length < 1 || value.length > maximum) {
    throw new TypeError(`${name} must contain between 1 and ${maximum} characters.`);
  }
  return value;
}

function boolean(value: boolean, name: string): boolean {
  if (typeof value !== 'boolean') throw new TypeError(`${name} must be a boolean.`);
  return value;
}

function utcInstant(value: string, name: string): string {
  if (!UTC_INSTANT.test(value) || Number.isNaN(Date.parse(value))) {
    throw new TypeError(`${name} must be a valid UTC RFC 3339 instant.`);
  }
  return value;
}

function validateUrl(value: string): string {
  const match = LICENCE_URL.exec(value);
  if (
    value.length > MAX_LICENCE_URL_LENGTH ||
    match === null ||
    match[1] === undefined ||
    match[1].length > MAX_DNS_HOSTNAME_LENGTH ||
    !/[A-Za-z]/.test(match[1])
  ) {
    throw new TypeError(
      'licence.url must match the supported credential-free HTTP(S) DNS URL grammar.',
    );
  }
  return value;
}

function isOwnedSyntheticFixture(source: SourceRegistrationInput): boolean {
  return (
    source.sourceId === 'synthetic-data' &&
    source.category === 'synthetic-listing' &&
    source.access.method === 'repository-fixture'
  );
}

export function decideSourceEnablement(source: SourceRegistration): SourceEnableDecision {
  if (!source.permissions.collectionAllowed) {
    return Object.freeze({ eligible: false, code: 'collection-not-allowed' });
  }

  if (isOwnedSyntheticFixture(source)) {
    return Object.freeze({ eligible: true });
  }

  if (source.review.outcome === 'forbidden') {
    return Object.freeze({ eligible: false, code: 'review-forbidden' });
  }
  if (source.review.outcome === 'not-verified') {
    return Object.freeze({ eligible: false, code: 'review-not-verified' });
  }
  if (source.review.outcome !== 'allowed' || source.review.reviewedAt === null) {
    return Object.freeze({ eligible: false, code: 'review-not-allowed' });
  }
  if (source.licence.status === 'not-verified') {
    return Object.freeze({ eligible: false, code: 'licence-not-verified' });
  }
  if (source.access.method !== 'remote-http') {
    return Object.freeze({ eligible: false, code: 'remote-access-required' });
  }
  if (source.rate.status === 'unconfigured') {
    return Object.freeze({ eligible: false, code: 'rate-unconfigured' });
  }
  if (source.rate.status === 'not-applicable') {
    return Object.freeze({ eligible: false, code: 'rate-not-applicable' });
  }
  return Object.freeze({ eligible: true });
}

export function createSourceRegistration(input: SourceRegistrationInput): SourceRegistration {
  if (!SOURCE_ID.test(input.sourceId) || input.sourceId.length > 100) {
    throw new TypeError('sourceId must be a lower-kebab identifier of at most 100 characters.');
  }
  bounded(input.displayLabel, 'displayLabel', 200);
  bounded(input.review.evidence, 'review.evidence', 1_000);
  bounded(input.access.detail, 'access.detail', 500);
  if (!SOURCE_CATEGORIES.includes(input.category)) {
    throw new TypeError('source category is not supported.');
  }
  if (!SOURCE_REVIEW_OUTCOMES.includes(input.review.outcome)) {
    throw new TypeError('review outcome is not supported.');
  }
  if (!SOURCE_ACCESS_METHODS.includes(input.access.method)) {
    throw new TypeError('access method is not supported.');
  }
  if (!['not-applicable', 'unconfigured', 'configured'].includes(input.rate.status)) {
    throw new TypeError('rate status is not supported.');
  }
  if (!['licensed', 'not-verified', 'not-applicable'].includes(input.licence.status)) {
    throw new TypeError('licence status is not supported.');
  }
  boolean(input.enabled, 'enabled');
  boolean(input.permissions.collectionAllowed, 'permissions.collectionAllowed');
  boolean(input.permissions.imageFetchingAllowed, 'permissions.imageFetchingAllowed');
  boolean(input.permissions.listingTextDisplayAllowed, 'permissions.listingTextDisplayAllowed');

  const reviewedAt = input.review.reviewedAt;
  if (input.review.outcome === 'not-required') {
    if (reviewedAt !== null) {
      throw new TypeError('not-required review must not have a review timestamp.');
    }
  } else if (input.review.outcome !== 'not-verified' && reviewedAt === null) {
    throw new TypeError(`${input.review.outcome} review requires a review timestamp.`);
  } else if (reviewedAt !== null) {
    utcInstant(reviewedAt, 'review.reviewedAt');
  }

  if (input.review.outcome === 'not-required' && !isOwnedSyntheticFixture(input)) {
    throw new TypeError('Review is not required only for the repository-owned synthetic fixture.');
  }
  if (input.category === 'synthetic-listing' && !isOwnedSyntheticFixture(input)) {
    throw new TypeError('The synthetic-listing category is reserved for synthetic-data.');
  }
  if (input.sourceId === 'synthetic-data' && !isOwnedSyntheticFixture(input)) {
    throw new TypeError('synthetic-data must use the complete repository-owned fixture identity.');
  }
  if (input.access.method === 'repository-fixture' && !isOwnedSyntheticFixture(input)) {
    throw new TypeError('Repository-fixture access is reserved for synthetic-data.');
  }
  if (
    isOwnedSyntheticFixture(input) &&
    (input.review.outcome !== 'not-required' ||
      input.rate.status !== 'not-applicable' ||
      input.licence.status !== 'not-applicable')
  ) {
    throw new TypeError('The repository-owned synthetic fixture requires not-applicable policy.');
  }

  if (input.rate.status === 'configured') {
    if (
      !Number.isSafeInteger(input.rate.limit) ||
      input.rate.limit <= 0 ||
      !Number.isSafeInteger(input.rate.windowSeconds) ||
      input.rate.windowSeconds <= 0
    ) {
      throw new TypeError('A configured rate requires a positive integer limit and window.');
    }
  } else if (input.rate.limit !== null || input.rate.windowSeconds !== null) {
    throw new TypeError('A non-configured rate must not carry a limit or window.');
  }

  if (input.licence.status === 'licensed') {
    bounded(input.licence.label, 'licence.label', 200);
    validateUrl(input.licence.url);
  } else if (input.licence.status === 'not-applicable') {
    bounded(input.licence.label, 'licence.label', 200);
    if (input.licence.url !== null)
      throw new TypeError('Not-applicable licence must not have a URL.');
  } else if (input.licence.label !== null || input.licence.url !== null) {
    throw new TypeError('Not-verified licence must not have a label or URL.');
  }

  if (input.enabled !== (input.enabledAt !== null)) {
    throw new TypeError('enabled and enabledAt must change together.');
  }
  if (input.enabledAt !== null) utcInstant(input.enabledAt, 'enabledAt');

  const copy: SourceRegistration = Object.freeze({
    ...input,
    permissions: Object.freeze({ ...input.permissions }),
    review: Object.freeze({ ...input.review }),
    access: Object.freeze({ ...input.access }),
    rate: Object.freeze({ ...input.rate }),
    licence: Object.freeze({ ...input.licence }),
  });
  if (copy.enabled && !decideSourceEnablement(copy).eligible) {
    throw new TypeError('An enabled source must satisfy the complete enable policy.');
  }
  return copy;
}

export function toEnabledSourceView(source: SourceRegistration): EnabledSourceView {
  if (!source.enabled) throw new TypeError('Only an enabled source can be projected publicly.');
  return Object.freeze({
    sourceId: source.sourceId,
    displayLabel: source.displayLabel,
    enabled: true,
    permissions: Object.freeze({ ...source.permissions }),
    licence: Object.freeze({ ...source.licence }),
  });
}
