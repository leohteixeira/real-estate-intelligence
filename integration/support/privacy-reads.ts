/**
 * Independent oracle for the enabled-source heading on the privacy screen. The four
 * repository-owned synthetic sources carry bundled Portuguese names; English, and any other
 * source, shows the attribution published by the API.
 */
const portugueseSourceNames: Readonly<Record<string, string>> = {
  'synthetic-data': 'Amostra sintética identificada',
  'synthetic-portal-aurora': 'Dados sintéticos — Aurora',
  'synthetic-portal-brisa': 'Dados sintéticos — Brisa',
  'synthetic-portal-cobalto': 'Dados sintéticos — Cobalto',
};

export function privacySourceName(
  source: { readonly sourceId: string; readonly displayLabel: string },
  locale: 'pt-BR' | 'en',
): string {
  return locale === 'en'
    ? source.displayLabel
    : (portugueseSourceNames[source.sourceId] ?? source.displayLabel);
}
