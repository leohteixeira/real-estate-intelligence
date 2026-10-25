// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../routes';
import { createLocale } from '../places/locale';
import { createReadCache, propertyQuery } from '../places/place-queries';
import { overviewFixture, propertyId } from '../places/overview-fixtures.test';
import { propertyDetailFixture } from './property-fixtures.test';
import type { PropertyResponse } from '@rei/contracts';
import { parsePropertyResponse } from '@rei/contracts';
import { formatComputedAt, formatExactMoney } from '../places/formatters';
import { propertyHref } from './property-navigation';
import { timeAxis } from './property-presentation';

const caches: ReturnType<typeof createReadCache>[] = [];
afterEach(async () => {
  cleanup();
  await Promise.all(
    caches.splice(0).map(async (cache) => {
      await cache.cancelQueries();
      cache.clear();
    }),
  );
  vi.unstubAllGlobals();
  localStorage.clear();
});
function Url() {
  const location = useLocation();
  return (
    <output aria-label="URL">
      {location.pathname}
      {location.search}
    </output>
  );
}
function mount(
  response = propertyDetailFixture(),
  path = `/properties/${propertyId}`,
  locale: 'pt-BR' | 'en' = 'pt-BR',
) {
  const request = vi.fn(
    async (input: string) =>
      new Response(
        JSON.stringify(input.startsWith('/api/v1/properties/') ? response : overviewFixture(input)),
      ),
  );
  vi.stubGlobal('fetch', request);
  const cache = createReadCache();
  caches.push(cache);
  render(
    <I18nextProvider i18n={createLocale(locale)}>
      <QueryClientProvider client={cache}>
        <MemoryRouter initialEntries={[path]}>
          <Url />
          <AppRoutes />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
  return { request, cache };
}
describe('Property outer surface', () => {
  it('uses actual other-neighborhood context and one date scale for visible labels, bars, ticks and gaps', async () => {
    const fixture = propertyDetailFixture();
    const april = '2026-04-01T12:00:00.000Z',
      june = '2026-06-01T12:00:00.000Z';
    const response = parsePropertyResponse({
      ...fixture,
      property: {
        ...fixture.property,
        summary: {
          ...fixture.property.summary,
          breadcrumbs: fixture.property.summary.breadcrumbs.map((place) =>
            place.kind === 'neighborhood'
              ? {
                  ...place,
                  id: 'sao-paulo-vila-mariana',
                  name: { ptBR: 'Vila Mariana', en: 'Vila Mariana' },
                }
              : place,
          ),
        },
        listings: fixture.property.listings.map((listing, index) =>
          index !== 2
            ? listing
            : {
                ...listing,
                lifeline: [
                  { from: listing.firstCollectedAt, to: april },
                  { from: june, to: null },
                ],
              },
        ),
      },
    });
    mount(response);
    await screen.findByRole('heading', { name: 'Rua Cenário Um' });
    for (const nav of screen.getAllByRole('navigation', { name: 'Navegação principal' }))
      expect(within(nav).getByRole('link', { name: 'Buscar' })).toHaveAttribute(
        'href',
        '/search/sao-paulo-vila-mariana',
      );
    expect(screen.getByRole('link', { name: 'Perguntar sobre este imóvel' })).toHaveAttribute(
      'href',
      '/ask/sao-paulo-vila-mariana',
    );
    const axis = timeAxis(response);
    const labels = [...document.querySelectorAll<HTMLElement>('.life__axis span')];
    labels.forEach((label) =>
      expect(label.style.left).toBe(`${axis.position(label.dataset.month!)}%`),
    );
    const gap = document.querySelector<HTMLElement>('.life__bar--off')!;
    expect(gap.style.left).toBe(`${axis.position(april)}%`);
    expect(parseFloat(gap.style.width)).toBeCloseTo(axis.position(june) - axis.position(april));
    expect(document.querySelector<HTMLElement>('.life__tick')!.style.left).toBe(
      `${axis.position(response.property.listings[0]!.history.find((event) => event.type === 'price-changed')!.effectiveAt)}%`,
    );
    await userEvent.click(screen.getByText('Cronologia por fonte'));
    expect(screen.getAllByText(/Removido não significa vendido/)[0]).toBeVisible();
  });
  it('presents unknown structured feature strings and actual non-reporters without inferring absence', async () => {
    const fixture = propertyDetailFixture(),
      reporter = fixture.property.listings[0]!;
    const feature = 'private-synthetic-amenity';
    const response = parsePropertyResponse({
      ...fixture,
      property: {
        ...fixture.property,
        featureAgreement: [
          {
            feature,
            reportingCount: 1,
            reportingPercent: 33.33,
            listingIds: [reporter.id],
            sourceIds: [reporter.source.sourceId],
          },
        ],
        preparedEvidence: {
          ...fixture.property.preparedEvidence,
          reasons: [{ type: 'shared-structured-feature', feature, listingIds: [reporter.id] }],
        },
      },
    });
    mount(response);
    await screen.findByRole('heading', { name: 'Rua Cenário Um' });
    const features = within(screen.getByRole('region', { name: 'Características e fontes' }));
    expect(
      within(document.querySelector('.property-feature-list')! as HTMLElement).getByRole(
        'heading',
        { name: feature },
      ),
    ).toBeVisible();
    expect(features.getByText('1 de 3 anúncios informam · 33,33%')).toBeVisible();
    await userEvent.click(features.getByText('Características por fonte'));
    expect(features.getByText('Informam: Aurora')).toBeVisible();
    expect(features.getByText('Não informam: Brisa · Cobalto')).toBeVisible();
    expect(
      features.getByText('Não informar não significa ausência da característica.'),
    ).toBeVisible();
    expect(
      within(document.querySelector('.property-reasons')! as HTMLElement).getByText(feature),
    ).toBeVisible();
  });
  it.each(['pt-BR', 'en'] as const)(
    'shows parsed values and all complete blocks in %s without invented evidence',
    async (locale) => {
      const response = propertyDetailFixture();
      const { request } = mount(response, undefined, locale);
      await screen.findByRole('heading', { name: 'Rua Cenário Um' });
      const price = within(
        screen.getByRole('region', { name: locale === 'en' ? 'Price' : 'Preço' }),
      );
      expect(price.getByText(locale === 'en' ? 'R$ 780,000' : 'R$ 780.000')).toBeVisible();
      expect(
        price.getByText(
          `${formatExactMoney(response.property.summary.pricePerSquareMeter!, locale)} /m²`,
        ),
      ).toBeVisible();
      expect(
        price.getByText(locale === 'en' ? 'No recorded sale' : 'Nenhuma venda registrada'),
      ).toBeVisible();
      expect(document.querySelectorAll('.property-reasons > li')).toHaveLength(9);
      expect(document.querySelectorAll('.life__track')).toHaveLength(3);
      expect(document.querySelectorAll('.property-price-events > li')).toHaveLength(2);
      for (const change of response.property.priceChanges)
        expect(
          screen.getAllByText(formatComputedAt(change.effectiveAt, locale)).length,
        ).toBeGreaterThan(0);
      expect(screen.getByText(locale === 'en' ? '0.95' : '0,95')).toBeVisible();
      expect(screen.getAllByText(/3 (de|of) 3 anúncios|3 of 3 listings/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Cobalto: Consolação/).length).toBeGreaterThan(0);
      expect(
        request.mock.calls.filter(([url]) => url === `/api/v1/properties/${propertyId}`),
      ).toHaveLength(1);
      for (const navigation of screen.getAllByRole('navigation', {
        name: locale === 'en' ? 'Main navigation' : 'Navegação principal',
      }))
        expect(
          within(navigation).getByRole('link', { name: locale === 'en' ? 'Search' : 'Buscar' }),
        ).toHaveAttribute('aria-current', 'page');
      expect(document.querySelector('.property-details img')).toBeNull();
    },
  );
  it('retains exact applied Search return and passes an escaped unexecuted Ask draft only in state', async () => {
    const returnTo = '/search/sao-paulo-bela-vista?sort=most-recent&priceReduced=false';
    mount(undefined, propertyHref(propertyId, returnTo));
    await screen.findByRole('heading', { name: 'Rua Cenário Um' });
    expect(screen.getByRole('link', { name: 'Voltar à busca' })).toHaveAttribute('href', returnTo);
    await userEvent.click(screen.getByRole('link', { name: 'Perguntar sobre este imóvel' }));
    expect(await screen.findByText(/Quero entender o histórico/)).toBeVisible();
    expect(screen.getByLabelText('URL')).toHaveTextContent('/ask/sao-paulo-bela-vista');
    expect(screen.getByLabelText('URL')).not.toHaveTextContent('Quero');
    expect(localStorage.length).toBe(0);
  });
  it.each(['bad-id', 'not%20an%20id', '0199a3e0-0000-4000-8000-000000000001'])(
    'suppresses malformed detail %s and keeps neutral index navigation',
    async (id) => {
      const { request } = mount(undefined, `/properties/${id}`);
      expect(screen.getByRole('alert')).toHaveTextContent('Identificador de imóvel inválido');
      expect(request.mock.calls.some(([url]) => url.startsWith('/api/v1/properties/'))).toBe(false);
      const nav = within(screen.getAllByRole('navigation', { name: 'Navegação principal' })[0]!);
      expect(nav.getByRole('link', { name: 'Buscar' })).toHaveAttribute('href', '/search');
    },
  );
  it('retains known detail on failed refetch and safely recovers manually', async () => {
    const { request, cache } = mount();
    await screen.findByRole('heading', { name: 'Rua Cenário Um' });
    request.mockImplementation(
      async () =>
        new Response('private exception body', {
          status: 503,
          headers: { 'x-request-id': '0199a3e0-0000-7000-8000-000000000999' },
        }),
    );
    await act(async () => {
      await cache.refetchQueries({ queryKey: propertyQuery(propertyId).queryKey });
    });
    expect(await screen.findByRole('alert')).not.toHaveTextContent('private exception');
    expect(screen.getByRole('heading', { name: 'Rua Cenário Um' })).toBeVisible();
    expect(
      request.mock.calls.filter(([url]) => url === `/api/v1/properties/${propertyId}`),
    ).toHaveLength(2);
    request.mockImplementation(async () => new Response(JSON.stringify(propertyDetailFixture())));
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(
      request.mock.calls.filter(([url]) => url === `/api/v1/properties/${propertyId}`),
    ).toHaveLength(3);
  });
  it.each(['denied', 'expired', 'removed', 'unresolved'] as const)(
    'renders the parsed %s branch truthfully',
    async (branch) => {
      const fixture = propertyDetailFixture();
      const listing = fixture.property.listings[0]!;
      const response: PropertyResponse = parsePropertyResponse({
        ...fixture,
        property: {
          ...fixture.property,
          listings: [
            {
              ...listing,
              ...(branch === 'denied'
                ? {
                    description: {
                      permission: 'denied',
                      changedAt: ['2026-01-01T12:00:00.000Z'],
                      sourceUrl: listing.source.url,
                    },
                  }
                : {}),
              ...(branch === 'expired'
                ? { snapshot: { ...listing.snapshot, availability: 'expired' } }
                : {}),
              ...(branch === 'removed'
                ? {
                    status: 'removed',
                    lifeline: [{ from: listing.firstCollectedAt, to: '2026-04-01T12:00:00.000Z' }],
                  }
                : {}),
            },
          ],
          ...(branch === 'removed'
            ? {
                summary: {
                  ...fixture.property.summary,
                  activeListingCount: 0,
                  askingPrice: null,
                  pricePerSquareMeter: null,
                  bedrooms: null,
                },
              }
            : {}),
          ...(branch === 'unresolved'
            ? {
                preparedEvidence: {
                  ...fixture.property.preparedEvidence,
                  illustrativeProbability: 0,
                  reasons: [],
                },
              }
            : {}),
        },
      });
      mount(response);
      await screen.findByRole('heading', { name: 'Rua Cenário Um' });
      const provenance = within(screen.getByRole('region', { name: 'Proveniência e descrições' }));
      await userEvent.click(provenance.getByText('Aurora', { selector: 'summary strong' }));
      if (branch === 'denied') {
        await userEvent.click(provenance.getByText('Datas de mudança da descrição'));
        expect(provenance.getByText(/não permite/)).toBeVisible();
        expect(screen.queryByText('<script>safe visible text</script>')).not.toBeInTheDocument();
      }
      if (branch === 'expired') {
        expect(provenance.getByText(/Expirado/, { selector: '.property-source dd' })).toBeVisible();
        await userEvent.click(provenance.getByText('Metadados seguros'));
        expect(provenance.getAllByText(listing.provenance.contentHash)[0]).toBeVisible();
      }
      if (branch === 'removed') {
        expect(screen.getByText('Preço pedido não disponível')).toBeVisible();
        expect(document.querySelector('.life__bar--off')).not.toBeNull();
        expect(screen.getByText('0 anúncios ativos')).toBeVisible();
      }
      if (branch === 'unresolved') {
        expect(screen.getByText(/valor zero não comprova/)).toBeVisible();
        expect(screen.queryByText('0,95')).not.toBeInTheDocument();
      }
    },
  );
});

describe('Property compact native evidence', () => {
  it('keeps canonical facts and nine bars visible while grouped source detail is closed and reachable', async () => {
    const response = propertyDetailFixture();
    mount(response);
    await screen.findByRole('heading', { name: 'Rua Cenário Um' });
    expect(document.querySelector('.property-app .place-navigation')).toBeNull();
    expect(document.querySelectorAll('.property-reasons > li')).toHaveLength(9);
    expect(document.querySelectorAll('.property-reasons details')).toHaveLength(0);
    const features = screen.getByRole('region', { name: 'Características e fontes' });
    expect(within(features).getByText('82 m²')).toBeVisible();
    expect(document.querySelectorAll('.property-feature-list details')).toHaveLength(0);
    const sources = [
      ...document.querySelectorAll<HTMLDetailsElement>('.property-source-disclosure'),
    ];
    expect(sources).toHaveLength(3);
    expect(sources.every((source) => !source.open)).toBe(true);
    const asking = screen.getByRole('region', { name: 'Preço' });
    await userEvent.click(within(asking).getByRole('link', { name: 'Aurora' }));
    const target = document.getElementById(
      `property-listing-${response.property.listings[0]!.id}`,
    )!;
    expect(sources[0]!.open).toBe(true);
    expect(target).toHaveFocus();
    expect(within(target).getByText('Primeira coleta')).toBeVisible();
    await userEvent.click(within(target).getByText('Metadados seguros'));
    expect(
      within(target).getAllByText(response.property.listings[0]!.provenance.contentHash)[0],
    ).toBeVisible();
    await userEvent.click(within(features).getByText('Atributos por fonte'));
    expect(within(features).getByText('Fontes divergem')).toBeVisible();
    await userEvent.click(screen.getByText('Localização', { selector: 'summary' }));
    expect(screen.getAllByRole('link', { name: 'São Paulo' })[0]).toBeVisible();
  });
  it('uses the contract street rather than a prepared block plaque and discloses raw English metadata only', async () => {
    const fixture = propertyDetailFixture();
    const label = 'Raw prepared grouping warning';
    const response = parsePropertyResponse({
      ...fixture,
      property: {
        ...fixture.property,
        summary: {
          ...fixture.property.summary,
          place: {
            ...fixture.property.summary.place,
            name: { ptBR: 'Synthetic block 001', en: 'Synthetic block 001' },
          },
        },
        preparedEvidence: { ...fixture.property.preparedEvidence, label },
      },
    });
    mount(response);
    await screen.findByRole('heading', { name: 'Rua Cenário Um' });
    const evidence = within(screen.getByRole('region', { name: 'Por que estão agrupados' }));
    expect(evidence.getByText(/Exemplo preparado, não calibrado/)).toBeVisible();
    expect(evidence.getByText(new RegExp(label))).not.toBeVisible();
    await userEvent.click(evidence.getByText('Razões e fontes'));
    expect(evidence.getByText(new RegExp(label))).toBeVisible();
    const chart = document.querySelector('.property-chart')!;
    expect(within(chart as HTMLElement).getByText('R$ 840.000,00')).toBeVisible();
    expect(within(chart as HTMLElement).getByText('R$ 780.000,00')).toBeVisible();
    expect(chart.querySelector('svg text')).toBeNull();
  });
});

describe('actual deterministic grouping evidence', () => {
  it.each(['pt-BR', 'en'] as const)(
    'renders uncalibrated actual rules and preserves detail navigation in %s',
    async (locale) => {
      const fixture = propertyDetailFixture();
      const response = parsePropertyResponse({
        ...fixture,
        property: {
          ...fixture.property,
          preparedEvidence: {
            kind: 'deterministic-rule',
            label: 'D-092 deterministic identity rules; probabilities are not calibrated',
            listingIds: fixture.property.listings.map((listing) => listing.id),
            productionMatchScore: 0.9,
            rawProbability: 0.9,
            probabilityBasis: 'deterministic-uncalibrated',
            configurationId: 'd092-initial',
            configurationVersion: 1,
            reasons: [
              {
                type: 'rule-comparison',
                listingIds: fixture.property.listings.slice(0, 2).map((listing) => listing.id),
                feature: 'images',
                available: true,
                score: 1,
                contribution: 0.6,
              },
              {
                type: 'rule-comparison',
                listingIds: fixture.property.listings.slice(0, 2).map((listing) => listing.id),
                feature: 'coordinates',
                available: false,
                score: null,
                contribution: 0,
              },
            ],
          },
        },
      });
      mount(response, `/properties/${propertyId}`, locale);
      expect(
        await screen.findByText(
          locale === 'en' ? 'Match rule score' : 'Pontuação de correspondência',
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          locale === 'en'
            ? 'Deterministic rule score; not statistically calibrated.'
            : 'Pontuação de regras determinísticas; sem calibração estatística.',
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(
          locale === 'en' ? 'Illustrative probability' : 'Probabilidade ilustrativa',
        ),
      ).not.toBeInTheDocument();
      expect(
        screen.getByText(
          new RegExp(locale === 'en' ? 'Rule evidence label' : 'Rótulo da evidência de regras'),
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(
          new RegExp(
            locale === 'en'
              ? 'Received prepared-evidence label'
              : 'Rótulo recebido da evidência preparada',
          ),
        ),
      ).not.toBeInTheDocument();
      expect(screen.getAllByText(/90/).length).toBeGreaterThan(0);
    },
  );
});
