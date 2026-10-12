import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { parsePlaceMarketResponse, parseSearchResponse } from '@rei/contracts';
import type { PropertySummary } from '@rei/contracts';
import { createLocale } from '../../src/places/locale';
import { Figure } from '../../src/shared/Figure';
import { PropertyRow } from '../../src/shared/PropertyRow';
import '../../src/styles/tokens.css';
import '../../src/styles/components.css';
import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-600.css';
import '@fontsource/barlow-condensed/latin-500.css';
import '@fontsource/barlow-condensed/latin-600.css';

declare global {
  interface Window {
    sharedComponentPayload: {
      readonly search: unknown;
      readonly market: unknown;
      readonly locale: 'pt-BR' | 'en';
    };
  }
}
const payload = window.sharedComponentPayload;
const search = parseSearchResponse(payload.search);
const market = parsePlaceMarketResponse(payload.market);
const property = search.items[0];
if (!property) throw new Error('The owned API must supply a property');
const median = market.figures.medianAskingPricePerSquareMeter;
if (median.state !== 'available') throw new Error('The owned API must supply an available median');
const locale = payload.locale;
document.documentElement.lang = locale;
const edges: readonly PropertySummary[] = [
  {
    ...property,
    id: 'edge-null',
    askingPrice: null,
    pricePerSquareMeter: null,
    areaSquareMeters: null,
    bedrooms: 0,
    activeListingCount: 0,
    timeOnMarketDays: 0,
    belowMedianPercent: null,
  },
  {
    ...property,
    id: 'edge-above',
    bedrooms: null,
    areaSquareMeters: 0,
    belowMedianPercent: -3.1,
    returnedToMarket: true,
  },
  { ...property, id: 'edge-equal', belowMedianPercent: 0 },
  {
    ...property,
    id: 'edge-long',
    belowMedianPercent: 3.1,
    askingPrice: property.askingPrice
      ? { ...property.askingPrice, minorUnits: 999999999999 }
      : null,
    place: {
      ...property.place,
      name: { ptBR: 'TrechoCanônico'.repeat(25), en: 'Never translate this' },
    },
  },
];
const root = document.getElementById('root');
if (!root) throw new Error('Missing component fixture root');
createRoot(root).render(
  <I18nextProvider i18n={createLocale(locale)}>
    <main className="rei">
      <h1>{locale === 'en' ? 'Shared component evidence' : 'Evidências dos componentes'}</h1>
      <section aria-label={locale === 'en' ? 'Parsed owned API data' : 'Dados da API própria'}>
        <Figure
          label={locale === 'en' ? 'Median asking price per m²' : 'Mediana do preço pedido por m²'}
          priceKind="asking"
          minorUnits={median.value.minorUnits}
          unit="/m²"
          evidence={median}
          synthetic
        />
        <PropertyRow property={property} href="#owned-property" />
      </section>
      <section aria-labelledby="edges">
        <h2 id="edges">
          {locale === 'en'
            ? 'Constructed component edge cases'
            : 'Casos construídos para componentes'}
        </h2>
        {edges.map((edge) => (
          <PropertyRow key={edge.id} property={edge} href="#owned-property" />
        ))}
        {(['fresh', 'stale', 'untracked'] as const).map((status) => (
          <Figure
            key={status}
            label={locale === 'en' ? 'Constructed evidence' : 'Evidência construída'}
            priceKind="asking"
            minorUnits={999999999999}
            unit="/m²"
            evidence={{
              ...median,
              freshness: { ...median.freshness, status },
              sources: [
                ...median.sources,
                {
                  id: 'long-component-source',
                  label: 'FonteCanônica'.repeat(25),
                  url: '#owned-source',
                  collectedAt: median.computedAt,
                },
              ],
            }}
            synthetic
            method={{ href: '#owned-method', label: locale === 'en' ? 'Method' : 'Método' }}
          />
        ))}
      </section>
      <section id="owned-property" tabIndex={-1}>
        <h2>{locale === 'en' ? 'Owned property destination' : 'Destino próprio do imóvel'}</h2>
      </section>
      <section id="owned-source">
        <h2>{locale === 'en' ? 'Owned source destination' : 'Destino próprio da fonte'}</h2>
      </section>
      <section id="owned-method">
        <h2>{locale === 'en' ? 'Owned method destination' : 'Destino próprio do método'}</h2>
      </section>
    </main>
  </I18nextProvider>,
);
