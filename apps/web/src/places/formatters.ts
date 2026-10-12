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
  if (!Number.isInteger(minorUnits)) return money(minorUnits, locale, 2);
  const value = BigInt(minorUnits);
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : locale, {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
    .formatToParts(value < 0n && value / 100n === 0n ? -0 : value / 100n)
    .map((part) =>
      part.type === 'fraction'
        ? String(value < 0n ? -(value % 100n) : value % 100n).padStart(2, '0')
        : part.value,
    )
    .join('')
    .replace(/\u00a0/g, ' ')
    .replace(/^R\$\s*/, 'R$ ');
}

export function formatCount(count: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : locale, {
    maximumFractionDigits: 0,
  }).format(count);
}

export function formatQuantity(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : locale, {
    maximumFractionDigits: 2,
  }).format(value);
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
