import { expect, it } from 'vitest';
import { publicHref } from './public-href';

it('prefixes native internal links while retaining query, fragment and root fixtures', () => {
  expect(
    publicHref('/properties/id?returnTo=%2Fsearch%2Fplace#evidence', '/real-estate-intelligence'),
  ).toBe('/real-estate-intelligence/properties/id?returnTo=%2Fsearch%2Fplace#evidence');
  expect(publicHref('/search/place', '/real-estate-intelligence')).toBe(
    '/real-estate-intelligence/search/place',
  );
  expect(publicHref('/search/place', '')).toBe('/search/place');
});
it.each([
  'https://source.example.test/property',
  '//source.example.test/property',
  '#evidence',
  'mailto:privacy@example.test',
])('preserves explicit external and document destinations %s', (href) => {
  expect(publicHref(href, '/real-estate-intelligence')).toBe(href);
});
