import { describe, expect, it } from 'vitest';
import { formatComputedAt, formatMedian } from './formatters';

describe('backend value presentation', () => {
  it('rounds server centavos to whole reais without changing the currency', () => {
    expect(formatMedian(951515, 'pt-BR')).toBe('R$ 9.515');
    expect(formatMedian(951515, 'en')).toBe('R$ 9,515');
    expect(formatMedian(951550, 'en')).toBe('R$ 9,516');
  });
  it('renders the server computation instant with an explicit UTC zone', () => {
    expect(formatComputedAt('2026-10-12T12:30:00.000Z', 'en')).toContain('12:30');
    expect(formatComputedAt('2026-10-12T12:30:00.000Z', 'pt-BR')).toContain('UTC');
  });
});
