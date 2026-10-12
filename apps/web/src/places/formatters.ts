import type { Locale } from './locale';

function money(minorUnits: number, locale: Locale, precision: number): string {
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : locale, {
    style: 'currency',
    currency: 'BRL',
    currencyDisplay: 'symbol',
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  })
    .format(minorUnits / 100)
    .replace(/\u00a0/g, ' ')
    .replace(/^R\$\s*/, 'R$ ');
}

export function formatMedian(minorUnits: number, locale: Locale): string {
  return money(minorUnits, locale, 0);
}

export function formatExactMoney(minorUnits: number, locale: Locale): string {
  return money(minorUnits, locale, 2);
}

export function formatCount(count: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : locale, {
    maximumFractionDigits: 0,
  }).format(count);
}

export function formatPercentage(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : locale, {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: 'exceptZero',
  })
    .format(value)
    .replace(/-/g, '−');
}

export function formatProbability(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
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
