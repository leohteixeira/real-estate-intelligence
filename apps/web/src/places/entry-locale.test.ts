// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { createLocale, entryLocale } from './locale';

afterEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});
it('opens in the hinted language, stores it and cleans the entry address', () => {
  localStorage.setItem('rei.locale', 'pt-BR');
  window.history.replaceState(null, '', '/places/sao-paulo-bela-vista?lang=en#series');
  expect(createLocale().language).toBe('en');
  expect(localStorage.getItem('rei.locale')).toBe('en');
  expect(`${window.location.pathname}${window.location.search}${window.location.hash}`).toBe(
    '/places/sao-paulo-bela-vista#series',
  );
});
it('keeps the stored preference when the entry address carries no valid hint', () => {
  localStorage.setItem('rei.locale', 'en');
  window.history.replaceState(null, '', '/places/sao-paulo-bela-vista?lang=fr');
  expect(entryLocale()).toBe('en');
  expect(window.location.search).toBe('?lang=fr');
  localStorage.clear();
  expect(entryLocale()).toBe('pt-BR');
});
