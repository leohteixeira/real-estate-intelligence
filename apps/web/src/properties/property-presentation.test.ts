import { describe, expect, it } from 'vitest';
import { propertyDetailFixture } from './property-fixtures.test';
import {
  evidenceAnchor,
  propertyStreet,
  removedIntervals,
  sourceLabel,
  timeAxis,
} from './property-presentation';

describe('Property shared presentation coordinates', () => {
  it('uses an explicitly reported street reason or the canonical block without guessing from a listing', () => {
    const response = propertyDetailFixture();
    expect(propertyStreet(response, 'pt-BR')).toBe('Rua Cenário Um');
    const unreported = {
      ...response,
      property: {
        ...response.property,
        preparedEvidence: { ...response.property.preparedEvidence, reasons: [] },
      },
    };
    expect(propertyStreet(unreported, 'pt-BR')).toBe(response.property.summary.place.name.ptBR);
    expect(propertyStreet(unreported, 'en')).toBe(response.property.summary.place.name.en);
  });
  it('positions month labels, lifeline endpoints and event ticks on one continuous date scale', () => {
    const response = propertyDetailFixture();
    const axis = timeAxis(response);
    expect(axis.months[0]).toBe('2025-10-01T00:00:00.000Z');
    const from = Date.parse(axis.months[0]!);
    const through = new Date(response.metadata.asOf);
    const to = Date.UTC(through.getUTCFullYear(), through.getUTCMonth() + 1, 1);
    for (const instant of [
      ...axis.months,
      ...response.property.priceChanges.map((change) => change.effectiveAt),
    ]) {
      expect(axis.position(instant)).toBeCloseTo(
        ((Date.parse(instant) - from) / (to - from)) * 100,
      );
    }
    expect(axis.position('2020-01-01T00:00:00.000Z')).toBe(0);
    expect(axis.position('2030-01-01T00:00:00.000Z')).toBe(100);
  });
  it('retains removed/reappeared gaps and ends terminal removed gaps at the response basis', () => {
    const response = propertyDetailFixture(),
      listing = response.property.listings[0]!;
    const april = '2026-04-01T12:00:00.000Z',
      june = '2026-06-01T12:00:00.000Z';
    expect(
      removedIntervals(
        {
          ...listing,
          lifeline: [
            { from: listing.firstCollectedAt, to: april },
            { from: june, to: null },
          ],
        },
        response.metadata.asOf,
      ),
    ).toEqual([{ from: april, to: june }]);
    expect(
      removedIntervals(
        { ...listing, lifeline: [{ from: listing.firstCollectedAt, to: april }] },
        response.metadata.asOf,
      ),
    ).toEqual([{ from: april, to: response.metadata.asOf }]);
    expect(removedIntervals(listing, response.metadata.asOf)).toEqual([]);
    expect(sourceLabel(response, 'aurora')).toBe('Aurora');
    expect(sourceLabel(response, 'unregistered')).toBe('unregistered');
    expect(evidenceAnchor(listing.id)).toBe(`property-listing-${listing.id}`);
  });
});
