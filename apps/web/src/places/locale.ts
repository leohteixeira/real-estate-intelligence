import { createInstance } from 'i18next';
import type { i18n } from 'i18next';
import { resources } from './resources';

export type Locale = 'pt-BR' | 'en';
const storageKey = 'rei.locale';

export function readLocale(storage?: Pick<Storage, 'getItem'>): Locale {
  try {
    return (storage ?? window.localStorage).getItem(storageKey) === 'en' ? 'en' : 'pt-BR';
  } catch {
    return 'pt-BR';
  }
}

/**
 * Language hint of the entry URL: `?lang=en`, `?lang=pt-BR` or `?lang=pt`. A valid hint becomes the
 * stored preference and leaves the address, so a later explicit choice survives a reload.
 */
export function readEntryLocale(
  location: Pick<Location, 'pathname' | 'search' | 'hash'> = window.location,
  replace: (url: string) => void = (url) => {
    window.history.replaceState(window.history.state, '', url);
  },
): Locale | null {
  const parameters = new URLSearchParams(location.search);
  const hint = parameters.get('lang');
  if (hint === null) return null;
  const locale = hint === 'en' ? 'en' : hint === 'pt-BR' || hint === 'pt' ? 'pt-BR' : null;
  if (locale === null) return null;
  parameters.delete('lang');
  const search = parameters.toString();
  replace(`${location.pathname}${search ? `?${search}` : ''}${location.hash}`);
  return locale;
}

/** Display name of a place in the interface language; the API always carries both. */
export function placeName(
  name: { readonly en: string; readonly ptBR: string },
  language: string,
): string {
  return language === 'en' ? name.en : name.ptBR;
}

export function saveLocale(locale: Locale, storage?: Pick<Storage, 'setItem'>): void {
  try {
    (storage ?? window.localStorage).setItem(storageKey, locale);
  } catch {
    // The explicit choice still applies for this visit when storage is blocked.
  }
}

/** Startup locale: the entry URL hint when present, otherwise the stored preference. */
export function entryLocale(): Locale {
  const hint = readEntryLocale();
  if (hint === null) return readLocale();
  saveLocale(hint);
  return hint;
}

export function createLocale(locale: Locale = entryLocale()): i18n {
  const instance = createInstance();
  void instance.init({
    lng: locale,
    fallbackLng: 'pt-BR',
    supportedLngs: ['pt-BR', 'en'],
    initAsync: false,
    defaultNS: 'place',
    ns: ['shell', 'place', 'search', 'ask', 'shared', 'property', 'listing', 'privacy'],
    resources,
    interpolation: { escapeValue: false },
  });
  return instance;
}
