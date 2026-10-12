import { describe, expect, it, vi } from 'vitest';
import { createLocale, readLocale, saveLocale } from './locale';

describe('locale preference', () => {
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
