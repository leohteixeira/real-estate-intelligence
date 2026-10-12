import type { Locale } from './locale';

export function formatMedian(minorUnits: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : locale, {
    style: 'currency',
    currency: 'BRL',
    currencyDisplay: 'symbol',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
    .format(minorUnits / 100)
    .replace(/\u00a0/g, ' ')
    .replace(/^R\$\s*/, 'R$ ');
}

export function formatComputedAt(instant: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'UTC',
    timeZoneName: 'short',
  }).format(new Date(instant));
}
