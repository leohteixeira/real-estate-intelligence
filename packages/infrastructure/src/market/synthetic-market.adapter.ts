import type { MarketFixtureReadPort, PreparedMarketSample } from '@rei/application';
import {
  pricePerSquareMeter,
  type MarketEvidence,
  type MarketFigure,
  type MarketMedian,
} from '@rei/domain';
import { SYNTHETIC_SAO_PAULO_DATASET, type SyntheticSaoPauloRun } from '../collection/index.js';
import { SYNTHETIC_READ_METADATA, syntheticBlockId } from '../locations/index.js';

export const MARKET_EVALUATED_AT = '2026-10-01T12:00:00.000Z';
const dataset = SYNTHETIC_SAO_PAULO_DATASET;
function median(values: readonly number[]): number {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle]! : (ordered[middle - 1]! + ordered[middle]!) / 2;
}
/** Explicitly labeled groups, never entity matching or a read of Properties state. */
function sample(scopeIds: readonly string[], run: SyntheticSaoPauloRun) {
  return dataset.properties
    .filter((group) => scopeIds.includes(syntheticBlockId(group.neighborhood)))
    .map((group) => {
      const listings = run.observations.filter((observation) =>
        group.listingReferences.some(
          (reference) =>
            reference.sourceId === observation.sourceId &&
            reference.sourceListingId === observation.sourceListingId,
        ),
      );
      const representative = [...listings].sort(
        (left, right) => left.listing.askingPriceMinorUnits - right.listing.askingPriceMinorUnits,
      )[0]!;
      return {
        listings,
        price: pricePerSquareMeter({
          priceInCents: representative.listing.askingPriceMinorUnits,
          areaInSquareMeters: representative.listing.areaSquareMeters,
        }),
        days:
          (Date.parse(run.observedAt) -
            Math.min(...listings.map((listing) => Date.parse(listing.listing.listedAt)))) /
          86400000,
      };
    });
}
type Sample = ReturnType<typeof sample>;
function evidence(groups: Sample, computedAt: string, recordCount: number): MarketEvidence {
  const ids = new Set(groups.flatMap((group) => group.listings.map((listing) => listing.sourceId)));
  return {
    recordCount,
    sources: dataset.sources
      .filter((source) => ids.has(source.sourceId))
      .map((source) => ({
        id: source.sourceId,
        label: source.displayLabel,
        url: source.baseUrl,
        collectedAt: computedAt,
      })),
    computedAt,
    freshness: {
      status: 'fresh',
      latestCollectionCompletedAt: ids.size ? computedAt : null,
      ageSeconds: (Date.parse(MARKET_EVALUATED_AT) - Date.parse(computedAt)) / 1000,
    },
  };
}
function figure<T>(value: T | null, proof: MarketEvidence): MarketFigure<T> {
  return value === null
    ? { ...proof, state: 'insufficient-data', value: null }
    : { ...proof, state: 'available', value };
}
function priceFigure(groups: Sample, computedAt: string): MarketMedian {
  return figure(
    groups.length
      ? { minorUnits: Math.round(median(groups.map((group) => group.price))), currency: 'BRL' }
      : null,
    evidence(groups, computedAt, groups.length),
  );
}
/** Monthly, six-month and thirty-day arithmetic is prepared scaffolding, not production policy. */
export class SyntheticMarketAdapter implements MarketFixtureReadPort {
  public async read(scopeIds: readonly string[]): Promise<PreparedMarketSample> {
    const latest = dataset.runs[12]!;
    const groups = sample(scopeIds, latest);
    const prior = sample(scopeIds, dataset.runs[6]!);
    const listings = groups.flatMap((group) => group.listings);
    const previousListings = sample(scopeIds, dataset.runs[11]!).flatMap((group) => group.listings);
    const reduced = listings.filter((listing) =>
      previousListings.some(
        (previous) =>
          previous.sourceId === listing.sourceId &&
          previous.sourceListingId === listing.sourceListingId &&
          previous.listing.askingPriceMinorUnits > listing.listing.askingPriceMinorUnits,
      ),
    ).length;
    const proof = evidence(groups, latest.observedAt, groups.length);
    const currentMedian = priceFigure(groups, latest.observedAt);
    const previousMedian = priceFigure(prior, dataset.runs[6]!.observedAt);
    return structuredClone({
      metadata: SYNTHETIC_READ_METADATA,
      basis: 'prepared-market-example',
      evaluatedAt: MARKET_EVALUATED_AT,
      counts: {
        properties: groups.length,
        activeListings: listings.length,
        sources: proof.sources.length,
      },
      figures: {
        medianAskingPricePerSquareMeter: currentMedian,
        askingPriceMovement: {
          ...figure(
            currentMedian.value && previousMedian.value
              ? ((currentMedian.value.minorUnits - previousMedian.value.minorUnits) /
                  previousMedian.value.minorUnits) *
                  100
              : null,
            proof,
          ),
          windowMonths: 6,
        },
        medianTimeOnMarketDays: figure(
          groups.length ? median(groups.map((group) => group.days)) : null,
          proof,
        ),
        priceReductions: {
          ...figure(
            listings.length
              ? { count: reduced, percentage: (reduced / listings.length) * 100 }
              : null,
            evidence(groups, latest.observedAt, listings.length),
          ),
          windowDays: 30,
        },
        listingsPerProperty: figure(groups.length ? listings.length / groups.length : null, proof),
        recordedSalePricePerSquareMeter: {
          ...evidence([], latest.observedAt, 0),
          state: 'not-recorded',
          value: null,
        },
      },
      points: dataset.runs.slice(1).map((run) => ({
        month: run.runKey,
        median: priceFigure(sample(scopeIds, run), run.observedAt),
      })),
    });
  }
}
