/**
 * Expected interface wording of labels the API publishes in English. The web bundles Portuguese
 * names for the repository-owned synthetic sources and evidence labels; every other label is
 * shown as received. Kept independent of the web sources: campaigns assert the rendered page.
 */
const sourceNamesPT: Readonly<Record<string, string>> = {
  'synthetic-data': 'Amostra sintética identificada',
  'synthetic-portal-aurora': 'Dados sintéticos — Aurora',
  'synthetic-portal-brisa': 'Dados sintéticos — Brisa',
  'synthetic-portal-cobalto': 'Dados sintéticos — Cobalto',
};
const sourceNamesEN: Readonly<Record<string, string>> = {
  'synthetic-data': 'Labelled synthetic fixture',
  'synthetic-portal-aurora': 'Synthetic data — Aurora',
  'synthetic-portal-brisa': 'Synthetic data — Brisa',
  'synthetic-portal-cobalto': 'Synthetic data — Cobalto',
};
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

export function displayedSourceName(
  source: { readonly sourceId: string; readonly label: string },
  locale: 'pt-BR' | 'en',
): string {
  return (locale === 'en' ? sourceNamesEN : sourceNamesPT)[source.sourceId] ?? source.label;
}

export function displayedEvidenceLabel(label: string, locale: 'pt-BR' | 'en'): string {
  return locale === 'en' ? label : (evidenceLabelsPT[label] ?? label);
}
