import {
  INITIAL_RESOLUTION_CONFIGURATION,
  NormalizedListing,
  SYNTHETIC_SAO_PAULO_MATCH_LABELS,
  compareResolutionInputs,
  type ResolutionInput,
} from '@rei/domain';
import { expect, it } from 'vitest';
import { SYNTHETIC_SAO_PAULO_DATASET, buildSyntheticSaoPauloReplay } from '../collection/index.js';

const key = (source: { readonly sourceId: string; readonly sourceListingId: string }) =>
  `${source.sourceId}\u0000${source.sourceListingId}`;
const id = (n: number) => `0199c8f2-2394-7000-8000-${String(n).padStart(12, '0')}`;

it('retains recorded precision and recall on every labelled monthly fixture view', () => {
  const events = buildSyntheticSaoPauloReplay().filter(
    (event) => event.type === 'collection.snapshot.parsed',
  );
  const labels = SYNTHETIC_SAO_PAULO_MATCH_LABELS;
  const pairs = new Set(labels.map(({ left, right }) => [key(left), key(right)].sort().join('|')));
  expect(labels).toHaveLength(36);
  expect(pairs.size).toBe(36);
  expect(labels.filter((pair) => pair.sameProperty)).toHaveLength(5);
  const views = SYNTHETIC_SAO_PAULO_DATASET.runs.map(({ observedAt }) => {
    const inputs = new Map<string, ResolutionInput>();
    for (const event of events) {
      if (event.payload.source.observedAt > observedAt) continue;
      const sourceKey = key(event.payload.source);
      const previous = inputs.get(sourceKey);
      inputs.set(sourceKey, {
        listingId: previous?.listingId ?? id(inputs.size + 1),
        originalPropertyId: previous?.originalPropertyId ?? id(inputs.size + 101),
        inputEventId: event.eventId,
        inputHash: event.payload.snapshot.contentHash,
        listing: new NormalizedListing(event),
      });
    }
    expect(inputs.size).toBe(9);
    let truePositives = 0,
      falsePositives = 0,
      trueNegatives = 0,
      falseNegatives = 0;
    for (const { left, right, sameProperty } of labels) {
      const a = inputs.get(key(left)),
        b = inputs.get(key(right));
      expect(a).toBeDefined();
      expect(b).toBeDefined();
      expect(key(left)).not.toBe(key(right));
      if (!a || !b) throw new Error('Calibration label has no authentic replay input.');
      const automatic = compareResolutionInputs(a, b).decision === 'automatic';
      if (automatic && sameProperty) truePositives += 1;
      else if (automatic) falsePositives += 1;
      else if (sameProperty) falseNegatives += 1;
      else trueNegatives += 1;
    }
    return {
      observedAt,
      truePositives,
      falsePositives,
      trueNegatives,
      falseNegatives,
      precision: truePositives / (truePositives + falsePositives || 1),
      recall: truePositives / (truePositives + falseNegatives || 1),
    };
  });
  console.info(
    'Synthetic resolution calibration:',
    JSON.stringify({
      datasetVersion: SYNTHETIC_SAO_PAULO_DATASET.version,
      configuration: INITIAL_RESOLUTION_CONFIGURATION,
      thresholds: { automatic: 0.9, review: 0.5 },
      recordedFloors: { precision: 1, recall: 1 },
      thresholdRecommendation:
        'retain fixed 0.90/0.50; this fixture has no uncertain-match labels to calibrate 0.50',
      limitation:
        'Repeated views of nine synthetic identities; no independent or statistical calibration.',
      views,
    }),
  );
  expect(views).toHaveLength(13);
  for (const view of views) {
    expect(view.precision, view.observedAt).toBeGreaterThanOrEqual(1);
    expect(view.recall, view.observedAt).toBeGreaterThanOrEqual(1);
    expect(view).toMatchObject({
      truePositives: 5,
      falsePositives: 0,
      trueNegatives: 31,
      falseNegatives: 0,
    });
  }
  expect(INITIAL_RESOLUTION_CONFIGURATION).toMatchObject({
    id: 'd092-initial',
    version: 1,
    weights: { coordinates: 0.15, images: 0.51, area: 0.17, bedrooms: 0.085, description: 0.085 },
  });
});
