import { describe, expect, it } from 'vitest';
import {
  formatComputedAt,
  formatMedian,
  formatExactMoney,
  formatCount,
  formatPercentage,
  formatProbability,
} from './formatters';

describe('backend value presentation', () => {
  it.each(['pt-BR', 'en'] as const)('formats design values in %s', (locale) => {
    const pt = locale === 'pt-BR';
    expect(formatExactMoney(1154412, locale)).toBe(pt ? 'R$ 11.544,12' : 'R$ 11,544.12');
    expect(formatCount(12480, locale)).toBe(pt ? '12.480' : '12,480');
    expect(formatPercentage(0.031, locale)).toBe(pt ? '+3,1%' : '+3.1%');
    expect(formatPercentage(-0.008, locale)).toBe(pt ? '−0,8%' : '−0.8%');
    expect(formatPercentage(0, locale)).toBe(pt ? '0,0%' : '0.0%');
    expect(formatProbability(0.91, locale)).toBe(pt ? '0,91' : '0.91');
  });
  it('rounds server centavos to whole reais without changing the currency', () => {
    expect(formatMedian(951515, 'pt-BR')).toBe('R$ 9.515');
    expect(formatMedian(951515, 'en')).toBe('R$ 9,515');
    expect(formatMedian(951550, 'en')).toBe('R$ 9,516');
  });
  it('keeps the exact last cent at the public safe-integer bound', () => {
    expect(formatExactMoney(Number.MAX_SAFE_INTEGER, 'pt-BR')).toBe('R$ 90.071.992.547.409,91');
    expect(formatExactMoney(Number.MAX_SAFE_INTEGER, 'en')).toBe('R$ 90,071,992,547,409.91');
  });
  it('preserves fractional backend medians and negative sub-real values', () => {
    expect(formatExactMoney(970401.5, 'pt-BR')).toBe('R$ 9.704,02');
    expect(formatExactMoney(970401.5, 'en')).toBe('R$ 9,704.02');
    expect(formatExactMoney(-1, 'en')).toBe('-R$0.01');
  });
  it('renders the server computation instant with an explicit UTC zone', () => {
    expect(formatComputedAt('2026-10-12T12:30:00.000Z', 'en')).toContain('12:30');
    expect(formatComputedAt('2026-10-12T12:30:00.000Z', 'pt-BR')).toContain('UTC');
  });
});
