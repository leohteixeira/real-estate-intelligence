import { fingerprintSimilarity } from '../collection/index.js';
import { normalizePlaceName, normalizeStreetName } from '../locations/index.js';
import { DomainValidationError, parseUuidV7 } from '../shared/index.js';
import type { NormalizedListing } from './listing/normalized-listing.vo.js';

export const RESOLUTION_FEATURES = [
  'coordinates',
  'images',
  'area',
  'bedrooms',
  'description',
] as const;
export type ResolutionFeature = (typeof RESOLUTION_FEATURES)[number];
export interface ResolutionConfiguration {
  readonly id: string;
  readonly version: number;
  readonly probabilityBasis: 'deterministic-uncalibrated';
  readonly weights: Readonly<Record<ResolutionFeature, number>>;
}
export const INITIAL_RESOLUTION_CONFIGURATION: ResolutionConfiguration = Object.freeze({
  id: 'd092-initial',
  version: 1,
  probabilityBasis: 'deterministic-uncalibrated',
  weights: Object.freeze({
    coordinates: 0.15,
    images: 0.51,
    area: 0.17,
    bedrooms: 0.085,
    description: 0.085,
  }),
});
export interface ResolutionInput {
  readonly listingId: string;
  readonly originalPropertyId: string;
  /** A privacy erasure preserves existing survivors while their matching evidence is unchanged. */
  readonly continuityGroupId?: string;
  readonly inputEventId: string;
  /** Digest of substantive matching values; excludes prices, activity and acquisition clocks. */
  readonly inputHash: string;
  readonly listing: NormalizedListing;
}
export interface ResolutionReason {
  readonly feature: ResolutionFeature;
  readonly available: boolean;
  readonly score: number | null;
  readonly baseWeight: number;
  readonly effectiveWeight: number;
  readonly contribution: number;
}
export interface ResolutionComparison {
  readonly leftListingId: string;
  readonly rightListingId: string;
  readonly leftInputEventId: string;
  readonly rightInputEventId: string;
  readonly rawProbability: number;
  readonly probability: number;
  readonly availableWeight: number;
  readonly incompatibilities: readonly ('city' | 'state' | 'street' | 'propertyType')[];
  readonly reasons: readonly ResolutionReason[];
  readonly decision: 'automatic' | 'review' | 'separate';
}
export interface ResolutionGroup {
  readonly propertyId: string;
  readonly listingIds: readonly string[];
}
/** Twelve decimal places are the stored/classified precision, including exact band boundaries. */
export const stableResolutionScore = (value: number): number => Math.round(value * 1e12) / 1e12;
export function validateResolutionConfiguration(configuration: ResolutionConfiguration): void {
  if (
    !/^[a-z][a-z0-9-]{0,63}$/.test(configuration.id) ||
    !Number.isSafeInteger(configuration.version) ||
    configuration.version < 1 ||
    configuration.probabilityBasis !== 'deterministic-uncalibrated' ||
    Object.keys(configuration.weights).sort().join(',') !==
      [...RESOLUTION_FEATURES].sort().join(',') ||
    RESOLUTION_FEATURES.some(
      (feature) =>
        !Number.isFinite(configuration.weights[feature]) || configuration.weights[feature] < 0,
    ) ||
    stableResolutionScore(
      RESOLUTION_FEATURES.reduce((sum, feature) => sum + configuration.weights[feature], 0),
    ) !== 1
  )
    throw new DomainValidationError('Invalid entity resolution configuration.', 'configuration');
}
export function resolutionBand(probability: number): ResolutionComparison['decision'] {
  if (!Number.isFinite(probability) || probability < 0 || probability > 1)
    throw new DomainValidationError('Invalid resolution probability.', 'probability');
  const stable = stableResolutionScore(probability);
  return stable >= 0.9 ? 'automatic' : stable >= 0.5 ? 'review' : 'separate';
}
function tokens(text: string): Set<string> {
  return new Set(
    text
      .normalize('NFC')
      .toLowerCase()
      .normalize('NFC')
      .match(/[\p{L}\p{M}\p{N}]+/gu) ?? [],
  );
}
function descriptionScore(left: string, right: string): number | null {
  const a = tokens(left),
    b = tokens(right);
  if (!a.size || !b.size) return null;
  return [...a].filter((token) => b.has(token)).length / new Set([...a, ...b]).size;
}
function imageScore(left: readonly string[], right: readonly string[]): number | null {
  let best: number | null = null;
  for (const a of left)
    for (const b of right) {
      let score: number | null = null;
      if (a && a === b) score = 1;
      else if (/^dhash64-v1:[a-f0-9]{16}$/.test(a) && /^dhash64-v1:[a-f0-9]{16}$/.test(b))
        score = fingerprintSimilarity(a, b);
      if (score !== null) best = Math.max(best ?? 0, score);
    }
  return best;
}
export function compareResolutionInputs(
  left: ResolutionInput,
  right: ResolutionInput,
  configuration: ResolutionConfiguration = INITIAL_RESOLUTION_CONFIGURATION,
): ResolutionComparison {
  validateResolutionConfiguration(configuration);
  for (const input of [left, right]) {
    parseUuidV7(input.listingId);
    parseUuidV7(input.originalPropertyId);
    parseUuidV7(input.inputEventId);
    if (
      !Number.isFinite(input.listing.areaSquareMeters.value) ||
      input.listing.areaSquareMeters.value <= 0 ||
      !Number.isSafeInteger(input.listing.bedrooms.value) ||
      input.listing.bedrooms.value < 0
    )
      throw new DomainValidationError('Invalid resolution numeric input.', 'listing');
  }
  const a = left.listing,
    b = right.listing;
  const scores: Record<ResolutionFeature, number | null> = {
    coordinates: null,
    images: imageScore(
      a.imageFingerprints.map((value) => value.value),
      b.imageFingerprints.map((value) => value.value),
    ),
    area:
      Math.min(a.areaSquareMeters.value, b.areaSquareMeters.value) /
      Math.max(a.areaSquareMeters.value, b.areaSquareMeters.value),
    bedrooms: Number(a.bedrooms.value === b.bedrooms.value),
    description: descriptionScore(a.maskedDescription.value, b.maskedDescription.value),
  };
  const availableWeight = stableResolutionScore(
    RESOLUTION_FEATURES.reduce(
      (sum, feature) => sum + (scores[feature] === null ? 0 : configuration.weights[feature]),
      0,
    ),
  );
  const reasons = RESOLUTION_FEATURES.map((feature): ResolutionReason => {
    const score = scores[feature];
    const effectiveWeight =
      score === null || !availableWeight ? 0 : configuration.weights[feature] / availableWeight;
    return {
      feature,
      available: score !== null,
      score: score === null ? null : stableResolutionScore(score),
      baseWeight: configuration.weights[feature],
      effectiveWeight: stableResolutionScore(effectiveWeight),
      contribution: stableResolutionScore((score ?? 0) * effectiveWeight),
    };
  });
  const rawProbability = stableResolutionScore(
    RESOLUTION_FEATURES.reduce(
      (sum, feature) =>
        sum +
        (scores[feature] ?? 0) *
          (availableWeight ? configuration.weights[feature] / availableWeight : 0),
      0,
    ),
  );
  const incompatibilities: ('city' | 'state' | 'street' | 'propertyType')[] = [];
  if (normalizePlaceName(a.location.city.value) !== normalizePlaceName(b.location.city.value))
    incompatibilities.push('city');
  if (
    normalizePlaceName(a.location.stateCode.value) !==
    normalizePlaceName(b.location.stateCode.value)
  )
    incompatibilities.push('state');
  if (normalizeStreetName(a.location.street.value) !== normalizeStreetName(b.location.street.value))
    incompatibilities.push('street');
  if (a.propertyType.value !== b.propertyType.value) incompatibilities.push('propertyType');
  const probability = incompatibilities.length
    ? 0
    : availableWeight < 0.75
      ? Math.min(rawProbability, 0.89)
      : rawProbability;
  return {
    leftListingId: left.listingId,
    rightListingId: right.listingId,
    leftInputEventId: left.inputEventId,
    rightInputEventId: right.inputEventId,
    rawProbability,
    probability,
    availableWeight,
    incompatibilities,
    reasons,
    decision: resolutionBand(probability),
  };
}
/** Greedy complete-link in stable source/listing order; every member pair must be automatic. */
export function resolvePropertyGroups(
  inputs: readonly ResolutionInput[],
  comparisons: readonly ResolutionComparison[],
): readonly ResolutionGroup[] {
  const ordered = [...inputs].sort((a, b) => {
    const key = (input: ResolutionInput) =>
      `${input.listing.sourceId.value}\u0000${input.listing.sourceListingId.value}\u0000${input.listingId}`;
    return key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0;
  });
  if (new Set(ordered.map((input) => input.listingId)).size !== inputs.length)
    throw new TypeError('Duplicate resolution listing.');
  const groups: ResolutionInput[][] = [];
  const retained = new Map<string, ResolutionInput[]>();
  for (const input of ordered)
    if (input.continuityGroupId) {
      parseUuidV7(input.continuityGroupId);
      const members = retained.get(input.continuityGroupId) ?? [];
      members.push(input);
      retained.set(input.continuityGroupId, members);
    }
  groups.push(...retained.values());
  const automatic = new Set(
    comparisons
      .filter((pair) => pair.decision === 'automatic')
      .map((pair) => [pair.leftListingId, pair.rightListingId].sort().join('/')),
  );
  for (const input of ordered) {
    if (input.continuityGroupId) continue;
    const group = groups.find((members) =>
      members.every((member) =>
        automatic.has([input.listingId, member.listingId].sort().join('/')),
      ),
    );
    if (group) group.push(input);
    else groups.push([input]);
  }
  return groups.map((members) => ({
    propertyId: members.map((member) => member.originalPropertyId).sort()[0]!,
    listingIds: members.map((member) => member.listingId),
  }));
}
