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

export function saveLocale(locale: Locale, storage?: Pick<Storage, 'setItem'>): void {
  try {
    (storage ?? window.localStorage).setItem(storageKey, locale);
  } catch {
    // The explicit choice still applies for this visit when storage is blocked.
  }
}

export function createLocale(locale: Locale = readLocale()): i18n {
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
