import { describe, expect, it } from 'vitest';
import { draftQuery, parseSearchState, removeGroup, searchHref, toDraft } from './search-state';

describe('Search URL and draft boundary', () => {
  it('round trips false, decimal area, ranges, sort and editor state without cursors', () => {
    const query = {
      placeId: 'sao-paulo',
      priceReduced: false,
      minArea: 82.5,
      maxAskingPrice: 60000050,
      sort: 'most-recent' as const,
    };
    const url = searchHref(query, true);
    expect(parseSearchState('sao-paulo', url.split('?')[1]!)).toEqual({
      valid: true,
      query,
      filters: true,
    });
    expect(removeGroup({ ...query, cursor: 'obsolete' }, 'reduced')).toEqual({
      placeId: 'sao-paulo',
      minArea: 82.5,
      maxAskingPrice: 60000050,
      sort: 'most-recent',
    });
  });
  it.each([
    'unknown=1',
    'priceReduced=true&priceReduced=false',
    'view=map',
    'sort=wrong',
    'propertyType=flat',
    'timeOnMarket=old',
    'pageSize=21',
    'pageSize=0',
    'cursor=anything',
    'minBedrooms=2.1',
    'minArea=0',
    'maxArea=1000000.01',
    'minAskingPrice=9007199254740992',
    'minAskingPrice=9007199254740991.1',
    'minArea=2&maxArea=1',
    'priceReduced=0',
    'minAskingPrice=1e2',
    'placeId=elsewhere',
  ])('rejects malformed URL %s', (search) => {
    expect(parseSearchState('sao-paulo', search).valid).toBe(false);
  });
  it.each(['pt-BR', 'en'] as const)(
    'converts %s amounts exactly and preserves area and false',
    (locale) => {
      const draft = toDraft(
        { placeId: 'sao-paulo', minAskingPrice: 60000050, minArea: 82.5, returnedToMarket: false },
        locale,
      );
      expect(draft.minAskingPrice).toBe(locale === 'en' ? '600,000.50' : '600.000,50');
      expect(draftQuery(draft, locale)).toEqual({
        valid: true,
        query: {
          placeId: 'sao-paulo',
          minAskingPrice: 60000050,
          minArea: 82.5,
          returnedToMarket: false,
        },
      });
    },
  );
  it.each(['1,234', '1.00', '-1', '1e2', '90071992547410', '1,001'])(
    'rejects ambiguous, excess precision and overflowing PT money %s',
    (value) => {
      expect(
        draftQuery(
          { ...toDraft({ placeId: 'sao-paulo' }, 'pt-BR'), minAskingPrice: value },
          'pt-BR',
        ).valid,
      ).toBe(false);
    },
  );
  it('removes an entire range together and retains other groups', () => {
    expect(
      removeGroup({ placeId: 'sao-paulo', minArea: 80, maxArea: 90, minBedrooms: 0 }, 'area'),
    ).toEqual({ placeId: 'sao-paulo', minBedrooms: 0 });
  });
  it.each(['pt-BR', 'en'] as const)(
    'preserves the last cent at the safe integer bound in %s',
    (locale) => {
      const query = { placeId: 'sao-paulo', minAskingPrice: Number.MAX_SAFE_INTEGER };
      expect(draftQuery(toDraft(query, locale), locale)).toEqual({ valid: true, query });
    },
  );
});
