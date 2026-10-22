import { describe, expect, it } from 'vitest';
import {
  propertyHref,
  validSearchReturn,
  propertyNeighborhood,
  isPropertyId,
} from './property-navigation';
import { propertyFixture } from '../places/overview-fixtures.test';
import { propertyQuery } from '../places/place-queries';

describe('Property navigation', () => {
  it('preserves the exact validated applied Search URL', () => {
    const path = '/search/sao-paulo-centro-bela-vista?sort=most-recent&priceReduced=false';
    expect(validSearchReturn(path)).toBe(path);
    expect(propertyHref(propertyFixture.property.summary.id, path)).toContain(
      encodeURIComponent(path),
    );
  });
  it.each([
    'https://evil.invalid/search/a',
    '//evil.invalid/search/a',
    '/search/a?unknown=x',
    '/search/a?view=filters',
    '/search/a#x',
    '/search/a\\x',
    '/places/a',
    '/search/a?priceReduced=true&priceReduced=false',
  ])('rejects unsafe or unapplied return %s', (path) => {
    expect(validSearchReturn(path)).toBeNull();
  });
  it('uses the actual neighborhood and a property-only cache key', () => {
    expect(propertyNeighborhood(propertyFixture.property.summary)?.name.ptBR).toBe('Bela Vista');
    expect(propertyQuery('place-one', propertyFixture.property.summary.id).queryKey).toEqual(
      propertyQuery('place-two', propertyFixture.property.summary.id).queryKey,
    );
  });
  it('rejects malformed property identities', () => {
    expect(isPropertyId('bad')).toBe(false);
    expect(isPropertyId(propertyFixture.property.summary.id)).toBe(true);
  });
});
