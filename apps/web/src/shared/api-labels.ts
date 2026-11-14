import type { i18n } from 'i18next';

/**
 * Name of a listing source in the interface language. Repository-owned synthetic sources are known
 * identifiers with bundled names (the same ones the privacy notice shows); any other source keeps
 * the attribution published by the API.
 */
export function sourceName(
  source: { readonly sourceId: string; readonly label: string },
  locale: Pick<i18n, 'exists' | 't'>,
): string {
  const key = `sourceName-${source.sourceId}`;
  return locale.exists(key, { ns: 'privacy' }) ? locale.t(key, { ns: 'privacy' }) : source.label;
}

/** Repository-owned evidence labels the API publishes as fixed English text. */
const evidenceLabelsPT: Readonly<Record<string, string>> = {
  'D-092 deterministic identity rules; probabilities are not calibrated':
    'Regras determinísticas de identidade D-092; as probabilidades não são calibradas',
  'Illustrative single-listing baseline; no production matching or calibration':
    'Referência ilustrativa de anúncio único; sem correspondência de produção nem calibração',
  'Persisted synthetic listing; deterministic identity rules':
    'Anúncio sintético persistido; regras determinísticas de identidade',
  'Persisted synthetic property; deterministic identity rules':
    'Imóvel sintético persistido; regras determinísticas de identidade',
  'Persisted synthetic listing history; matching pending':
    'Histórico de anúncio sintético persistido; correspondência pendente',
  'Persisted initial synthetic observation; history and matching pending':
    'Observação sintética inicial persistida; histórico e correspondência pendentes',
};

/**
 * Evidence label in the interface language. These labels carry no identifier, so the known
 * repository-owned texts are matched whole; any other label is shown as received.
 */
export function evidenceLabel(label: string, language: string): string {
  return language === 'en' ? label : (evidenceLabelsPT[label] ?? label);
}
