import { createHash } from 'node:crypto';

import {
  COLLECTION_LISTING_SUPPRESSED_TYPE,
  COLLECTION_RUN_COMPLETED_TYPE,
  COLLECTION_SNAPSHOT_PARSED_TYPE,
  SYNTHETIC_SAO_PAULO_LISTING_REFERENCES,
  SYNTHETIC_SAO_PAULO_MATCH_LABELS,
  parseCollectionEvent,
  type CollectionSnapshotParsed,
} from '@rei/domain';
import { describe, expect, it } from 'vitest';

import {
  SYNTHETIC_SAO_PAULO_DATASET,
  buildSyntheticSaoPauloReplay,
  type SyntheticSaoPauloRunObservation,
} from './index.js';

function listingKey(value: { readonly sourceId: string; readonly sourceListingId: string }) {
  return `${value.sourceId}\u0000${value.sourceListingId}`;
}

function compareListingKeys(
  left: { readonly sourceId: string; readonly sourceListingId: string },
  right: { readonly sourceId: string; readonly sourceListingId: string },
) {
  const leftKey = listingKey(left);
  const rightKey = listingKey(right);
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
}

function objectKeys(value: unknown): readonly string[] {
  if (Array.isArray(value)) return value.flatMap(objectKeys);
  if (typeof value !== 'object' || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) => [key.toLowerCase(), ...objectKeys(child)]);
}

function listingContentHash(listing: CollectionSnapshotParsed['payload']['listing']) {
  return `sha256:${createHash('sha256').update(JSON.stringify(listing), 'utf8').digest('hex')}`;
}

function manifestHash(observations: readonly SyntheticSaoPauloRunObservation[]) {
  const identifiers = observations.map(({ sourceListingId }) => sourceListingId).sort();
  return `sha256:${createHash('sha256').update(JSON.stringify(identifiers), 'utf8').digest('hex')}`;
}

function parsedByRunAndListing() {
  const result = new Map<string, CollectionSnapshotParsed>();
  for (const event of buildSyntheticSaoPauloReplay()) {
    if (event.type !== COLLECTION_SNAPSHOT_PARSED_TYPE) continue;
    result.set(
      `${event.payload.source.observedAt}\u0000${listingKey(event.payload.source)}`,
      event,
    );
  }
  return result;
}

describe('synthetic Sao Paulo dataset', () => {
  it('has the fixed fictional catalogue and complete cross-file references', () => {
    const dataset = SYNTHETIC_SAO_PAULO_DATASET;
    expect(dataset.sources).toHaveLength(3);
    expect(dataset.sources.map(({ sourceId }) => sourceId)).toEqual([
      'synthetic-portal-aurora',
      'synthetic-portal-brisa',
      'synthetic-portal-cobalto',
    ]);
    expect(dataset.properties).toHaveLength(5);
    expect(dataset.listings).toHaveLength(9);
    expect(dataset.places).toEqual([
      { neighborhood: 'Bela Vista', zone: 'Centro' },
      { neighborhood: 'Santana', zone: 'Norte' },
      { neighborhood: 'Vila Mariana', zone: 'Sul' },
      { neighborhood: 'Tatuapé', zone: 'Leste' },
      { neighborhood: 'Pinheiros', zone: 'Oeste' },
    ]);
    expect(new Set(dataset.properties.map(({ neighborhood }) => neighborhood))).toEqual(
      new Set(dataset.places.map(({ neighborhood }) => neighborhood)),
    );
    expect(
      dataset.sources.every(({ displayLabel }) => displayLabel.includes('Synthetic data')),
    ).toBe(true);
    expect(new Set(dataset.sources.map(({ baseUrl }) => new URL(baseUrl).hostname))).toHaveLength(
      3,
    );
    expect(
      dataset.sources.every(({ baseUrl }) => new URL(baseUrl).hostname.endsWith('.invalid')),
    ).toBe(true);

    const datasetKeys = new Set(dataset.listings.map(({ reference }) => listingKey(reference)));
    expect(datasetKeys).toEqual(new Set(SYNTHETIC_SAO_PAULO_LISTING_REFERENCES.map(listingKey)));
    for (const label of SYNTHETIC_SAO_PAULO_MATCH_LABELS) {
      expect(datasetKeys.has(listingKey(label.left))).toBe(true);
      expect(datasetKeys.has(listingKey(label.right))).toBe(true);
    }
    expect(Object.isFrozen(dataset)).toBe(true);
    expect(Object.isFrozen(dataset.runs)).toBe(true);
    expect(dataset.runs.every(Object.isFrozen)).toBe(true);
  });

  it('covers thirteen strictly monthly fixed UTC runs and stable history changes', () => {
    const runs = SYNTHETIC_SAO_PAULO_DATASET.runs;
    expect(runs).toHaveLength(13);
    expect(runs.map(({ observedAt }) => observedAt.slice(0, 10))).toEqual([
      '2025-10-01',
      '2025-11-01',
      '2025-12-01',
      '2026-01-01',
      '2026-02-01',
      '2026-03-01',
      '2026-04-01',
      '2026-05-01',
      '2026-06-01',
      '2026-07-01',
      '2026-08-01',
      '2026-09-01',
      '2026-10-01',
    ]);
    expect(runs.every(({ observedAt }) => observedAt.endsWith('Z'))).toBe(true);
    expect(runs.map(({ observedAt }) => Date.parse(observedAt))).toEqual(
      [...runs].map(({ observedAt }) => Date.parse(observedAt)).sort((left, right) => left - right),
    );

    let priceChanges = 0;
    let descriptionChanges = 0;
    const previous = new Map<string, SyntheticSaoPauloRunObservation>();
    for (const run of runs) {
      expect(run.observations.map(listingKey)).toEqual(
        [...run.observations].sort(compareListingKeys).map(listingKey),
      );
      for (const observation of run.observations) {
        const key = listingKey(observation);
        const before = previous.get(key);
        if (before?.listing.askingPriceMinorUnits !== observation.listing.askingPriceMinorUnits) {
          if (before) priceChanges += 1;
        }
        if (before?.listing.maskedDescription !== observation.listing.maskedDescription) {
          if (before) descriptionChanges += 1;
        }
        previous.set(key, observation);
      }
    }
    expect(priceChanges).toBeGreaterThan(1);
    expect(descriptionChanges).toBeGreaterThan(1);

    const reappearingKey = listingKey({
      sourceId: 'synthetic-portal-cobalto',
      sourceListingId: 'COB-VM-001',
    });
    const presence = runs.map(({ observations }) =>
      observations.some((item) => listingKey(item) === reappearingKey),
    );
    expect(presence).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
      false,
      false,
      true,
      true,
      true,
      true,
      true,
    ]);
  });

  it('contains only privacy-reviewed fixture data and opaque prepared fingerprints', () => {
    const serialized = JSON.stringify(SYNTHETIC_SAO_PAULO_DATASET);
    const lower = serialized.toLowerCase();
    for (const forbidden of [
      'olx',
      'quintoandar',
      'zap imóveis',
      'viva real',
      'imovelweb',
      'loft',
      'mercado livre',
      'chaves na mão',
      'imageurl',
      'imagebytes',
      'photograph',
      'perceptual',
      'phash',
      'complement',
      'individualcreci',
    ]) {
      expect(lower).not.toContain(forbidden);
    }
    const keys = objectKeys(SYNTHETIC_SAO_PAULO_DATASET);
    for (const forbiddenKey of [
      'naturalpersonname',
      'phone',
      'email',
      'cpf',
      'individualcreci',
      'unit',
      'complement',
      'imageurl',
      'imagebytes',
      'photograph',
      'algorithm',
    ]) {
      expect(keys).not.toContain(forbiddenKey);
    }
    expect(serialized).not.toMatch(/\b\d{3}[. ]?\d{3}[. ]?\d{3}[- ]?\d{2}\b/);
    expect(serialized).not.toMatch(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
    const descriptions = SYNTHETIC_SAO_PAULO_DATASET.runs.flatMap(({ observations }) =>
      observations.map(({ listing }) => listing.maskedDescription),
    );
    expect(descriptions.join('\n')).not.toMatch(
      /(?:\+?55\s*)?(?:\(?\d{2}\)?[\s.-]*)?\d{4,5}[\s.-]*\d{4}/,
    );

    for (const { listing } of SYNTHETIC_SAO_PAULO_DATASET.listings) {
      expect(listing.currency).toBe('BRL');
      expect(listing.imageFingerprints.length).toBeGreaterThan(0);
      expect(
        listing.imageFingerprints.every((value) => value.startsWith('fixture-fingerprint:')),
      ).toBe(true);
    }

    const nearNeighbors = SYNTHETIC_SAO_PAULO_DATASET.listings.filter(({ reference }) =>
      ['AUR-BV-001', 'AUR-PN-001'].includes(reference.sourceListingId),
    );
    expect(nearNeighbors[0]?.reference.propertyLabel).not.toBe(
      nearNeighbors[1]?.reference.propertyLabel,
    );
    expect(nearNeighbors[0]?.listing).toMatchObject({
      areaSquareMeters: nearNeighbors[1]?.listing.areaSquareMeters,
      bedrooms: nearNeighbors[1]?.listing.bedrooms,
      maskedDescription: nearNeighbors[1]?.listing.maskedDescription,
    });
    expect(
      nearNeighbors[0]?.listing.imageFingerprints.some((value) =>
        nearNeighbors[1]?.listing.imageFingerprints.includes(value),
      ),
    ).toBe(true);

    const samePublishedNeighborhood = SYNTHETIC_SAO_PAULO_DATASET.listings.filter(({ reference }) =>
      ['COB-BV-001', 'BRI-VM-001'].includes(reference.sourceListingId),
    );
    expect(samePublishedNeighborhood[0]?.listing.location.neighborhood).toBe(
      samePublishedNeighborhood[1]?.listing.location.neighborhood,
    );
    expect(samePublishedNeighborhood[0]?.reference.propertyLabel).not.toBe(
      samePublishedNeighborhood[1]?.reference.propertyLabel,
    );
  });
});

describe('synthetic Sao Paulo replay', () => {
  it('strictly hydrates three source-scoped runs per monthly cycle', () => {
    const events = buildSyntheticSaoPauloReplay();
    const registeredSourceIds = new Set(
      SYNTHETIC_SAO_PAULO_DATASET.sources.map(({ sourceId }) => sourceId),
    );
    const expectedLength = SYNTHETIC_SAO_PAULO_DATASET.runs.reduce(
      (total, run) => total + run.observations.length + registeredSourceIds.size,
      0,
    );
    expect(events).toHaveLength(expectedLength);
    expect(events.map((event) => parseCollectionEvent(JSON.parse(JSON.stringify(event))))).toEqual(
      events,
    );

    let offset = 0;
    for (const run of SYNTHETIC_SAO_PAULO_DATASET.runs) {
      for (const source of SYNTHETIC_SAO_PAULO_DATASET.sources) {
        const observations = run.observations.filter(
          ({ sourceId }) => sourceId === source.sourceId,
        );
        const subsequence = events.slice(offset, offset + observations.length + 1);
        offset += subsequence.length;
        expect(
          subsequence.slice(0, -1).every(({ type }) => type === COLLECTION_SNAPSHOT_PARSED_TYPE),
        ).toBe(true);
        const parsedEvents = subsequence.slice(0, -1);
        expect(
          parsedEvents.map((event) =>
            event.type === COLLECTION_SNAPSHOT_PARSED_TYPE
              ? event.payload.source.sourceListingId
              : null,
          ),
        ).toEqual(observations.map(({ sourceListingId }) => sourceListingId));
        for (const event of parsedEvents) {
          if (event.type !== COLLECTION_SNAPSHOT_PARSED_TYPE) {
            throw new Error('Unexpected event in the parsed-event portion of a source run.');
          }
          expect(event.payload.source.sourceId).toBe(source.sourceId);
          expect(event.payload.snapshot.contentHash).toBe(
            listingContentHash(event.payload.listing),
          );
        }
        const completed = subsequence.at(-1);
        expect(completed?.type).toBe(COLLECTION_RUN_COMPLETED_TYPE);
        if (completed?.type !== COLLECTION_RUN_COMPLETED_TYPE)
          throw new Error('Missing source completion event.');
        expect(registeredSourceIds.has(completed.payload.sourceId)).toBe(true);
        expect(completed.payload).toMatchObject({
          sourceId: source.sourceId,
          observedCount: observations.length,
          parsedCount: observations.length,
          suppressedCount: 0,
          failedCount: 0,
          manifestHash: manifestHash(observations),
        });
        for (const event of parsedEvents) {
          if (event.type !== COLLECTION_SNAPSHOT_PARSED_TYPE) continue;
          expect(event.payload.source.sourceId).toBe(completed.payload.sourceId);
          expect(event.payload.run.runId).toBe(completed.aggregateId);
        }
      }
    }
    expect(offset).toBe(events.length);
    const completions = events.filter(({ type }) => type === COLLECTION_RUN_COMPLETED_TYPE);
    expect(completions).toHaveLength(39);
    expect(new Set(completions.map(({ aggregateId }) => aggregateId))).toHaveLength(39);
    expect(events.some(({ type }) => type === COLLECTION_LISTING_SUPPRESSED_TYPE)).toBe(false);
  });

  it('makes the Cobalto absence and reappearance visible in source-scoped manifests', () => {
    const cobaltoSourceId = 'synthetic-portal-cobalto';
    const completions = buildSyntheticSaoPauloReplay().filter(
      (event) =>
        event.type === COLLECTION_RUN_COMPLETED_TYPE && event.payload.sourceId === cobaltoSourceId,
    );
    expect(completions).toHaveLength(13);

    for (const [index, run] of SYNTHETIC_SAO_PAULO_DATASET.runs.entries()) {
      const observations = run.observations.filter(({ sourceId }) => sourceId === cobaltoSourceId);
      expect(completions[index]?.payload.manifestHash).toBe(manifestHash(observations));
    }

    const cobaltoListingIds = (runIndex: number) =>
      SYNTHETIC_SAO_PAULO_DATASET.runs[runIndex]!.observations.filter(
        ({ sourceId }) => sourceId === cobaltoSourceId,
      ).map(({ sourceListingId }) => sourceListingId);
    expect(cobaltoListingIds(6)).toEqual(['COB-BV-001', 'COB-TT-001']);
    expect(cobaltoListingIds(7)).toEqual(['COB-BV-001', 'COB-TT-001']);
    expect(cobaltoListingIds(8)).toEqual(['COB-BV-001', 'COB-TT-001', 'COB-VM-001']);
    expect(completions[6]?.payload.manifestHash).toBe(completions[7]?.payload.manifestHash);
    expect(completions[8]?.payload.manifestHash).not.toBe(completions[7]?.payload.manifestHash);
  });

  it('reuses content hashes only for unchanged canonical listing bytes', () => {
    const events = parsedByRunAndListing();
    const event = (date: string, sourceId: string, sourceListingId: string) =>
      events.get(`${date}T12:00:00.000Z\u0000${listingKey({ sourceId, sourceListingId })}`);

    const unchangedBefore = event('2025-10-01', 'synthetic-portal-aurora', 'AUR-SN-001');
    const unchangedAfter = event('2025-11-01', 'synthetic-portal-aurora', 'AUR-SN-001');
    expect(unchangedAfter?.payload.snapshot.contentHash).toBe(
      unchangedBefore?.payload.snapshot.contentHash,
    );

    const priceBefore = event('2025-12-01', 'synthetic-portal-aurora', 'AUR-BV-001');
    const priceAfter = event('2026-01-01', 'synthetic-portal-aurora', 'AUR-BV-001');
    expect(priceAfter?.payload.listing.askingPriceMinorUnits).not.toBe(
      priceBefore?.payload.listing.askingPriceMinorUnits,
    );
    expect(priceAfter?.payload.snapshot.contentHash).not.toBe(
      priceBefore?.payload.snapshot.contentHash,
    );

    const descriptionBefore = event('2026-02-01', 'synthetic-portal-brisa', 'BRI-BV-001');
    const descriptionAfter = event('2026-03-01', 'synthetic-portal-brisa', 'BRI-BV-001');
    expect(descriptionAfter?.payload.listing.maskedDescription).not.toBe(
      descriptionBefore?.payload.listing.maskedDescription,
    );
    expect(descriptionAfter?.payload.snapshot.contentHash).not.toBe(
      descriptionBefore?.payload.snapshot.contentHash,
    );
  });

  it('returns independent immutable byte-identical deterministic replays', () => {
    const first = buildSyntheticSaoPauloReplay();
    const second = buildSyntheticSaoPauloReplay();

    expect(first).not.toBe(second);
    for (const [index, firstEvent] of first.entries()) {
      const secondEvent = second[index];
      expect(firstEvent).not.toBe(secondEvent);
      expect(firstEvent.payload).not.toBe(secondEvent?.payload);
      expect(Object.isFrozen(firstEvent.payload)).toBe(true);
    }
    expect(Object.isFrozen(first)).toBe(true);
    expect(first.every(Object.isFrozen)).toBe(true);
    expect(Buffer.from(JSON.stringify(first), 'utf8')).toEqual(
      Buffer.from(JSON.stringify(second), 'utf8'),
    );
    const firstHydrated = first.map((event) =>
      parseCollectionEvent(JSON.parse(JSON.stringify(event))),
    );
    const secondHydrated = second.map((event) =>
      parseCollectionEvent(JSON.parse(JSON.stringify(event))),
    );
    expect(firstHydrated).toEqual(secondHydrated);
    expect(() => {
      (first as unknown as unknown[]).push('mutation');
    }).toThrow();
  });
});
