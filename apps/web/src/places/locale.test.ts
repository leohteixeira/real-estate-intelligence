import { describe, expect, it, vi } from 'vitest';
import { createLocale, placeName, readEntryLocale, readLocale, saveLocale } from './locale';
import { resources } from './resources';

describe('locale preference', () => {
  it('bundles complete shell/place/search/ask/shared namespace pairs', () => {
    expect(Object.keys(resources['pt-BR'])).toEqual([
      'shell',
      'place',
      'search',
      'ask',
      'shared',
      'property',
      'listing',
      'privacy',
    ]);
    for (const namespace of [
      'shell',
      'place',
      'search',
      'ask',
      'shared',
      'property',
      'listing',
      'privacy',
    ] as const) {
      expect(Object.keys(resources.en[namespace])).toEqual(
        Object.keys(resources['pt-BR'][namespace]),
      );
      expect(Object.values(resources.en[namespace]).every((value) => value.length > 0)).toBe(true);
    }
    expect(createLocale('en').t('title', { ns: 'ask' })).toBe('Ask');
    expect(createLocale('pt-BR').t('title', { ns: 'search' })).toBe('Buscar');
  });
  it.each(['pt', 'pt-BR', null, 'fr'])('safely defaults %s to Portuguese', (stored) => {
    expect(readLocale({ getItem: () => stored })).toBe('pt-BR');
  });
  it('reads English and tolerates denied storage', () => {
    expect(readLocale({ getItem: () => 'en' })).toBe('en');
    expect(
      readLocale({
        getItem: () => {
          throw new Error('Denied');
        },
      }),
    ).toBe('pt-BR');
    expect(() =>
      saveLocale('en', {
        setItem: () => {
          throw new Error('Denied');
        },
      }),
    ).not.toThrow();
  });
  it('stores the explicit preference and loads complete paired resources', () => {
    const setItem = vi.fn();
    saveLocale('pt-BR', { setItem });
    expect(setItem).toHaveBeenCalledWith('rei.locale', 'pt-BR');
    expect(createLocale('pt-BR').t('median')).toBe('Mediana do preço pedido por m²');
    expect(createLocale('en').t('median')).toBe('Median asking price per m²');
  });
  it.each([
    ['?lang=en', 'en', '/places/bela'],
    ['?lang=pt-BR', 'pt-BR', '/places/bela'],
    ['?lang=pt', 'pt-BR', '/places/bela'],
    ['?view=filters&lang=en&type=house', 'en', '/places/bela?view=filters&type=house'],
  ] as const)(
    'applies the entry hint %s and removes only that parameter',
    (search, locale, url) => {
      const replace = vi.fn();
      expect(readEntryLocale({ pathname: '/places/bela', search, hash: '' }, replace)).toBe(locale);
      expect(replace).toHaveBeenCalledExactlyOnceWith(url);
    },
  );
  it.each(['', '?lang=fr', '?lang=', '?language=en'])(
    'leaves the stored preference and the address alone for "%s"',
    (search) => {
      const replace = vi.fn();
      expect(readEntryLocale({ pathname: '/', search, hash: '#top' }, replace)).toBeNull();
      expect(replace).not.toHaveBeenCalled();
    },
  );
  it('keeps the fragment when removing the hint', () => {
    const replace = vi.fn();
    readEntryLocale({ pathname: '/privacy', search: '?lang=en', hash: '#sources' }, replace);
    expect(replace).toHaveBeenCalledExactlyOnceWith('/privacy#sources');
  });
  it.each([
    ['pt-BR', ['0 imóveis', '1 imóvel', '2.000 imóveis'], ['0 fontes', '1 fonte', '2.000 fontes']],
    [
      'en',
      ['0 properties', '1 property', '2.000 properties'],
      ['0 sources', '1 source', '2.000 sources'],
    ],
  ] as const)(
    'counts %s place totals with singular, plural and zero forms',
    (locale, properties, sources) => {
      const { t } = createLocale(locale);
      const forms = (key: string) =>
        [0, 1, 2000].map((count) => t(key, { count, formatted: count === 2000 ? '2.000' : count }));
      expect(forms('countProperties')).toEqual(properties);
      expect(forms('countSources')).toEqual(sources);
      expect(t('countListings', { count: 1, formatted: 1 })).toBe(
        locale === 'en' ? '1 active listing' : '1 anúncio ativo',
      );
    },
  );
  it('names a place in the interface language', () => {
    const name = { en: 'Central zone', ptBR: 'Zona Centro' };
    expect(placeName(name, 'en')).toBe('Central zone');
    expect(placeName(name, 'pt-BR')).toBe('Zona Centro');
  });
});
