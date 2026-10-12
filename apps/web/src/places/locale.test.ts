import { describe, expect, it, vi } from 'vitest';
import { createLocale, readLocale, saveLocale } from './locale';
import { resources } from './resources';

describe('locale preference', () => {
  it('bundles complete shell/place/search/ask/shared namespace pairs', () => {
    expect(Object.keys(resources['pt-BR'])).toEqual(['shell', 'place', 'search', 'ask', 'shared']);
    for (const namespace of ['shell', 'place', 'search', 'ask', 'shared'] as const) {
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
});
