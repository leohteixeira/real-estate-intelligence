import { describe, expect, it } from 'vitest';
import { NormalizedListing } from './listing/normalized-listing.vo.js';
import {
  compareResolutionInputs,
  INITIAL_RESOLUTION_CONFIGURATION,
  resolutionBand,
  resolvePropertyGroups,
  validateResolutionConfiguration,
  type ResolutionInput,
} from './property-resolution.js';
import {
  parsePropertyMatchQueuedForReview,
  PropertyMatchQueuedForReview,
} from './property-match.events.js';
const id = (n: number) => `0199c8f2-2394-7000-8000-${String(n).padStart(12, '0')}`;
function input(
  n: number,
  patch: {
    area?: number;
    bedrooms?: number;
    description?: string;
    images?: string[];
    city?: string;
    state?: string;
    street?: string;
    neighborhood?: string;
    propertyType?: string;
  } = {},
): ResolutionInput {
  const event = {
    eventId: id(n + 100),
    type: 'collection.snapshot.parsed',
    version: 3,
    aggregateId: id(n + 200),
    occurredAt: '2026-10-10T14:00:00.000Z',
    traceContext: null,
    payload: {
      run: { runId: id(1) },
      snapshot: { snapshotId: id(n + 200), contentHash: `sha256:${'a'.repeat(64)}` },
      source: {
        sourceId: `synthetic-${n}`,
        sourceListingId: `L-${n}`,
        sourceUrl: `https://synthetic.invalid/${n}`,
        observedAt: '2026-10-10T12:00:00.000Z',
      },
      listing: {
        propertyType: patch.propertyType ?? 'apartment',
        askingPriceMinorUnits: 100000,
        currency: 'BRL',
        areaSquareMeters: patch.area ?? 100,
        bedrooms: patch.bedrooms ?? 2,
        bathrooms: 1,
        parkingSpaces: 0,
        features: [],
        location: {
          city: patch.city ?? 'São Paulo',
          stateCode: patch.state ?? 'SP',
          street: patch.street ?? 'Rua Cenário Um',
          neighborhood: patch.neighborhood ?? 'Bela Vista',
        },
        listedAt: '2026-10-01T12:00:00.000Z',
        advertiser: { type: 'private', agencyName: null },
        maskedDescription: patch.description ?? 'Olá casa ampla',
        imageFingerprints: patch.images ?? ['fixture:same-image'],
      },
    },
  };
  return {
    listingId: id(n + 10),
    originalPropertyId: id(n + 20),
    inputEventId: event.eventId,
    inputHash: `sha256:${String(n).padStart(64, '0')}`,
    listing: new NormalizedListing(event),
  };
}
describe('D-092 deterministic identity', () => {
  it('returns zero when every weighted reason is unavailable without dividing by zero', () => {
    const configuration = {
      ...INITIAL_RESOLUTION_CONFIGURATION,
      weights: { coordinates: 1, images: 0, area: 0, bedrooms: 0, description: 0 },
    };
    const result = compareResolutionInputs(
      input(1, { images: [], description: '.' }),
      input(2, { images: [], description: '.' }),
      configuration,
    );
    expect(result.availableWeight).toBe(0);
    expect(result.rawProbability).toBe(0);
    expect(result.probability).toBe(0);
    expect(result.decision).toBe('separate');
    expect(
      result.reasons.every(
        (reason) => Number.isFinite(reason.contribution) && reason.effectiveWeight === 0,
      ),
    ).toBe(true);
  });
  it.each([
    [0.499999999, 'separate'],
    [0.5, 'review'],
    [0.899999999, 'review'],
    [0.9, 'automatic'],
    [1, 'automatic'],
  ] as const)('classifies fixed boundary %s as %s', (score, band) =>
    expect(resolutionBand(score)).toBe(band),
  );
  it('rounds exactly ninety percent before classification and never treats unavailable coordinates as agreement', () => {
    const result = compareResolutionInputs(
      input(1, { description: 'Alpha' }),
      input(2, { description: 'Beta' }),
    );
    expect(result.rawProbability).toBe(0.9);
    expect(result.probability).toBe(0.9);
    expect(result.decision).toBe('automatic');
    expect(result.reasons[0]).toEqual({
      feature: 'coordinates',
      available: false,
      score: null,
      baseWeight: 0.15,
      effectiveWeight: 0,
      contribution: 0,
    });
    expect(result.availableWeight).toBe(0.85);
  });
  it('uses NFC Unicode token-set Jaccard, area min/max and bedroom equality', () => {
    const result = compareResolutionInputs(
      input(1, { description: 'CAFE\u0301 casa casa 123', area: 80 }),
      input(2, { description: 'café jardim 123', area: 100, bedrooms: 3 }),
    );
    expect(result.reasons.find((r) => r.feature === 'description')?.score).toBe(0.5);
    expect(result.reasons.find((r) => r.feature === 'area')?.score).toBe(0.8);
    expect(result.reasons.find((r) => r.feature === 'bedrooms')?.score).toBe(0);
  });
  it('uses the best comparable exact/dHash image pair, with unknown unequal fingerprints unavailable', () => {
    const result = compareResolutionInputs(
      input(1, { images: ['dhash64-v1:0000000000000000', 'fixture:unknown-a'] }),
      input(2, { images: ['fixture:unknown-b', 'dhash64-v1:0000000000000001'] }),
    );
    expect(result.reasons.find((r) => r.feature === 'images')?.score).toBe(63 / 64);
    const sparse = compareResolutionInputs(
      input(1, { images: ['fixture:unknown-a'], description: '.' }),
      input(2, { images: ['fixture:unknown-b'], description: '.' }),
    );
    expect(sparse.reasons.filter((r) => !r.available).map((r) => r.feature)).toEqual([
      'coordinates',
      'images',
      'description',
    ]);
    expect(sparse.rawProbability).toBe(1);
    expect(sparse.probability).toBe(0.89);
    expect(sparse.availableWeight).toBe(0.255);
  });
  it.each([
    { city: 'Campinas' },
    { state: 'RJ' },
    { street: 'Rua Outra' },
    { propertyType: 'condominium' },
  ])('retains incompatibility and forces zero despite generic imagery: %j', (patch) => {
    const result = compareResolutionInputs(input(1), input(2, patch));
    expect(result.rawProbability).toBe(1);
    expect(result.probability).toBe(0);
    expect(result.incompatibilities).toHaveLength(1);
  });
  it('normalizes public city/street names and preserves neighborhood disagreements', () => {
    const a = input(1),
      b = input(2, { city: 'sao paulo', street: 'R. Cenario Um', neighborhood: 'Vila Mariana' });
    expect(compareResolutionInputs(a, b).decision).toBe('automatic');
    expect(b.listing.location.neighborhood.value).toBe('Vila Mariana');
  });
  it('builds deterministic complete-link groups rather than transitive components', () => {
    const a = input(1, { area: 100 }),
      b = input(2, { area: 70 }),
      c = input(3, { area: 49 });
    const comparisons = [
      compareResolutionInputs(a, b),
      compareResolutionInputs(b, c),
      compareResolutionInputs(a, c),
    ];
    expect(comparisons.map((pair) => pair.decision)).toEqual(['automatic', 'automatic', 'review']);
    const groups = resolvePropertyGroups([c, b, a], comparisons);
    expect(groups.map((group) => group.listingIds.length)).toEqual([2, 1]);
    expect(groups[0]?.propertyId).toBe(a.originalPropertyId);
    expect(resolvePropertyGroups([a, b, c], comparisons)).toEqual(groups);
  });
  it('preserves an erased group survivor set without allowing unrelated members to join without complete-link evidence', () => {
    const a = { ...input(2), continuityGroupId: id(100) };
    const b = { ...input(3), continuityGroupId: id(100) };
    const c = input(1);
    expect(resolvePropertyGroups([c, b, a], [])).toEqual([
      { propertyId: a.originalPropertyId, listingIds: [a.listingId, b.listingId] },
      { propertyId: c.originalPropertyId, listingIds: [c.listingId] },
    ]);
    expect(() => resolvePropertyGroups([{ ...a, continuityGroupId: 'bad' }], [])).toThrow();
  });
  it('refuses nonfinite probabilities and invalid or unidentified configuration before use', () => {
    for (const score of [NaN, Infinity, -1, 1.1]) expect(() => resolutionBand(score)).toThrow();
    for (const config of [
      { ...INITIAL_RESOLUTION_CONFIGURATION, id: '' },
      { ...INITIAL_RESOLUTION_CONFIGURATION, version: 0 },
      {
        ...INITIAL_RESOLUTION_CONFIGURATION,
        weights: { ...INITIAL_RESOLUTION_CONFIGURATION.weights, area: NaN },
      },
      {
        ...INITIAL_RESOLUTION_CONFIGURATION,
        weights: { ...INITIAL_RESOLUTION_CONFIGURATION.weights, area: 0.5 },
      },
    ])
      expect(() => validateResolutionConfiguration(config)).toThrow();
  });
  it('publishes only strict safe durable review facts and rejects extra content or automatic decisions', () => {
    const comparison = compareResolutionInputs(
      input(1, { images: [], description: '.' }),
      input(2, { images: [], description: '.' }),
    );
    const event = new PropertyMatchQueuedForReview({
      eventId: id(500),
      aggregateId: comparison.leftListingId,
      occurredAt: '2026-10-10T14:00:00.000Z',
      payload: { configurationId: 'd092-initial', configurationVersion: 1, comparison },
    });
    expect(parsePropertyMatchQueuedForReview(JSON.parse(JSON.stringify(event)))).toEqual(event);
    const wire = JSON.parse(JSON.stringify(event)) as { payload: Record<string, unknown> };
    wire.payload.description = 'secret';
    expect(() => parsePropertyMatchQueuedForReview(wire)).toThrow();
    expect(JSON.stringify(event)).not.toMatch(/same-image|Olá casa|synthetic.invalid/);
  });
});
