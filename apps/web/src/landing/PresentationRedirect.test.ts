// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, expect, it, vi } from 'vitest';
import { createLocale } from '../places/locale';
import { PresentationRedirect } from './PresentationRedirect';
import { presentationUrl } from './presentation-url';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('keeps the old landing fragment when linking to the central presentation', () => {
  expect(presentationUrl()).toBe('https://leohteixeira.com/en/projects/real-estate-intelligence');
  expect(presentationUrl('#zone')).toBe(
    'https://leohteixeira.com/en/projects/real-estate-intelligence#zone',
  );
});
it('links to the presentation in the interface language', () => {
  expect(presentationUrl('', 'pt-BR')).toBe(
    'https://leohteixeira.com/pt/projects/real-estate-intelligence',
  );
  expect(presentationUrl('#zone', 'en')).toBe(
    'https://leohteixeira.com/en/projects/real-estate-intelligence#zone',
  );
});
it.each([
  ['pt-BR', 'https://leohteixeira.com/pt/projects/real-estate-intelligence'],
  ['en', 'https://leohteixeira.com/en/projects/real-estate-intelligence'],
] as const)('sends the %s interface to its own presentation', (locale, destination) => {
  const replace = vi.fn();
  vi.stubGlobal('location', { hash: '', replace });
  render(
    createElement(
      I18nextProvider,
      { i18n: createLocale(locale) },
      createElement(PresentationRedirect),
    ),
  );
  expect(screen.getByRole('link').getAttribute('href')).toBe(destination);
  expect(replace).toHaveBeenCalledExactlyOnceWith(destination);
});
