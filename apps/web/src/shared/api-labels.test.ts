import { describe, expect, it } from 'vitest';
import { createLocale } from '../places/locale';
import { evidenceLabel, sourceName } from './api-labels';

describe('API-published labels in the interface language', () => {
  it.each([
    ['synthetic-portal-aurora', 'Synthetic data — Aurora', 'Dados sintéticos — Aurora'],
    ['synthetic-portal-brisa', 'Synthetic data — Brisa', 'Dados sintéticos — Brisa'],
    ['synthetic-portal-cobalto', 'Synthetic data — Cobalto', 'Dados sintéticos — Cobalto'],
  ] as const)('names the repository-owned source %s in both languages', (sourceId, en, ptBR) => {
    const source = { sourceId, label: en };
    expect(sourceName(source, createLocale('pt-BR'))).toBe(ptBR);
    expect(sourceName(source, createLocale('en'))).toBe(en);
  });
  it('keeps the attribution published for any other source', () => {
    const source = { sourceId: 'licensed-portal', label: 'Portal Licenciado S.A.' };
    expect(sourceName(source, createLocale('pt-BR'))).toBe(source.label);
    expect(sourceName(source, createLocale('en'))).toBe(source.label);
  });
  it.each([
    [
      'D-092 deterministic identity rules; probabilities are not calibrated',
      'Regras determinísticas de identidade D-092; as probabilidades não são calibradas',
    ],
    [
      'Persisted synthetic listing; deterministic identity rules',
      'Anúncio sintético persistido; regras determinísticas de identidade',
    ],
    [
      'Persisted synthetic property; deterministic identity rules',
      'Imóvel sintético persistido; regras determinísticas de identidade',
    ],
  ] as const)('translates the known evidence label %s only in Portuguese', (label, ptBR) => {
    expect(evidenceLabel(label, 'pt-BR')).toBe(ptBR);
    expect(evidenceLabel(label, 'en')).toBe(label);
  });
  it('shows an unknown evidence label as received', () => {
    expect(evidenceLabel('Persisted synthetic evidence', 'pt-BR')).toBe(
      'Persisted synthetic evidence',
    );
  });
});
