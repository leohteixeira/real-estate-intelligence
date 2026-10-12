// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { AppRoutes } from '../routes';
import { createLocale } from './locale';
import type { Locale } from './locale';
import { createReadCache } from './place-queries';
import { OverviewMetric } from './OverviewFigure';
import { bela, brasil, marketFixture, metadata } from './place-fixtures.test';
import {
  overviewFixture,
  reductionsFixture,
  seriesFixture,
  neighboursFixture,
  propertyFixture,
  propertyId,
} from './overview-fixtures.test';

const caches: ReturnType<typeof createReadCache>[] = [];
afterEach(async () => {
  cleanup();
  for (const cache of caches.splice(0)) {
    await cache.cancelQueries();
    cache.clear();
  }
  vi.unstubAllGlobals();
  localStorage.clear();
});
function Location() {
  const location = useLocation();
  return (
    <output aria-label="URL">
      {location.pathname}
      {location.search}
    </output>
  );
}
function mount(
  locale: Locale = 'en',
  id = bela.id,
  read: (path: string) => unknown = overviewFixture,
) {
  const cache = createReadCache();
  caches.push(cache);
  const request = vi.fn(async (path: string, options?: RequestInit) => {
    void options;
    return new Response(JSON.stringify(read(path)));
  });
  const dispatch = vi.fn(async (path: string, options: RequestInit) => {
    await Promise.resolve();
    return request(path, options);
  });
  vi.stubGlobal('fetch', dispatch);
  const view = render(
    <I18nextProvider i18n={createLocale(locale)}>
      <QueryClientProvider client={cache}>
        <MemoryRouter initialEntries={[`/places/${id}`]}>
          <Location />
          <AppRoutes />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
  return { cache, request, ...view };
}
it.each(['pt-BR', 'en'] as const)(
  'keeps default evidence concise and retains individual full evidence on opening in %s',
  async (locale) => {
    const { container } = mount(locale);
    await screen.findByText(locale === 'en' ? 'R$ 9,515' : 'R$ 9.515');
    const live = container.querySelector<HTMLElement>('.place-median')!;
    const summary = live.querySelector('summary')!;
    expect(summary.textContent).toBe(
      locale === 'en' ? 'Evidence · 1 property' : 'Evidências · 1 imóvel',
    );
    expect(summary).not.toHaveTextContent(/UTC|Computed|Calculada|Freshness|Atualidade/);
    expect(
      within(live).getByText(locale === 'en' ? 'Collected events' : 'Eventos coletados'),
    ).toBeVisible();
    await userEvent.click(summary);
    const evidence = within(live.querySelector<HTMLElement>('.place-provenance')!);
    expect(
      evidence.getByText(locale === 'en' ? '1 contributing property' : '1 imóvel contribuinte'),
    ).toBeVisible();
    expect(evidence.getByText(/12:00 UTC/)).toBeVisible();
    expect(
      evidence.getByText(locale === 'en' ? 'Freshness not tracked' : 'Atualidade não rastreada'),
    ).toBeVisible();
    expect(evidence.getByRole('link', { name: /synthetic-data/ })).toHaveAttribute(
      'href',
      'https://synthetic.invalid',
    );
    const sale = container.querySelector<HTMLElement>('.place-sale')!;
    const saleReason =
      locale === 'en'
        ? 'No recorded sale in this figure’s sources.'
        : 'Nenhuma venda registrada nas fontes deste indicador.';
    expect(
      within(sale).getByText(locale === 'en' ? 'None available' : 'Nenhum disponível'),
    ).toBeVisible();
    expect(within(sale).getByText(saleReason)).not.toBeVisible();
    await userEvent.click(sale.querySelector('summary')!);
    expect(within(sale).getByText(saleReason)).toBeVisible();
    const listings = container.querySelector<HTMLElement>('.place-reductions30')!;
    expect(listings.querySelector('summary')).toHaveTextContent(
      locale === 'en' ? 'Evidence · 2,500 listings' : 'Evidências · 2.500 anúncios',
    );
    await userEvent.click(listings.querySelector('summary')!);
    expect(
      within(listings.querySelector<HTMLElement>('.place-provenance')!).getByText(
        locale === 'en' ? '2,500 contributing listings' : '2.500 anúncios contribuintes',
      ),
    ).toBeVisible();
  },
);
it('starts compact and exposes each figure and monthly table through native evidence disclosures', async () => {
  const { container } = mount();
  await screen.findByText('R$ 9,515');
  const live = container.querySelector<HTMLElement>('.place-median')!;
  const evidence = live.querySelector('details')!;
  expect(evidence).not.toBeNull();
  expect(evidence).not.toHaveAttribute('open');
  expect(within(live).getByText('Sources: synthetic-data')).not.toBeVisible();
  expect(within(live).getByText('Evidence · 1 property')).toBeVisible();
  const summary = evidence.querySelector('summary')!;
  summary.focus();
  expect(summary).toHaveFocus();
  await userEvent.click(summary);
  expect(evidence).toHaveAttribute('open');
  expect(within(live).getByRole('link', { name: 'Sources: synthetic-data' })).toBeVisible();
  expect(
    within(live.querySelector<HTMLElement>('.place-provenance')!).getByText(/12:00 UTC/),
  ).toBeVisible();
  expect(
    within(live.querySelector<HTMLElement>('.place-provenance')!).getByText(
      'Freshness not tracked',
    ),
  ).toBeVisible();
  const series = container.querySelector<HTMLElement>('.place-series')!;
  const tableSummary = await within(series).findByText('View all 12 months and evidence');
  expect(within(series).getByRole('table')).not.toBeVisible();
  await userEvent.click(tableSummary);
  expect(within(series).getByRole('table')).toBeVisible();
  expect(series.querySelectorAll('tbody tr')).toHaveLength(12);
  const point = series.querySelector('tbody details summary')!;
  await userEvent.click(point);
  expect(
    within(point.parentElement!).getByRole('link', { name: 'Sources: Synthetic source' }),
  ).toBeVisible();
  const neighbour = container.querySelector<HTMLElement>('.place-neighbour')!;
  expect(neighbour.querySelectorAll('details')).toHaveLength(2);
  for (const control of neighbour.querySelectorAll('summary')) await userEvent.click(control);
  expect(
    within(neighbour).getAllByRole('link', { name: 'Sources: Synthetic source' }),
  ).toHaveLength(2);
});
it.each(['pt-BR', 'en'] as const)(
  'renders every overview element with independent origin and evidence in %s',
  async (locale) => {
    const view = mount(locale);
    await screen.findByText(locale === 'en' ? 'R$ 9,515' : 'R$ 9.515');
    const live = within(view.container.querySelector<HTMLElement>('.place-median')!);
    await userEvent.click(view.container.querySelector('.place-median summary')!);
    await userEvent.click(view.container.querySelector('.place-reductions30 summary')!);
    expect(
      live.getByText(locale === 'en' ? '1 contributing property' : '1 imóvel contribuinte'),
    ).toBeVisible();
    expect(
      screen.getByText(
        locale === 'en'
          ? '2,000 properties · 2,500 active listings · 5 sources'
          : '2.000 imóveis · 2.500 anúncios ativos · 5 fontes',
      ),
    ).toBeVisible();
    expect(screen.getByRole('region', { name: /Centro/ })).toBeVisible();
    expect(
      screen.getByRole('heading', {
        name: locale === 'en' ? 'Median time on market' : 'Tempo mediano de anúncio',
      }),
    ).toBeVisible();
    expect(
      screen.getByText(
        locale === 'en' ? '2,500 contributing listings' : '2.500 anúncios contribuintes',
      ),
    ).toBeVisible();
    expect(
      screen.getByText(locale === 'en' ? 'None available' : 'Nenhum disponível'),
    ).toBeVisible();
    expect(screen.getByText(locale === 'en' ? 'Sale' : 'Venda')).toBeVisible();
    await userEvent.click(
      await screen.findByText(
        locale === 'en' ? 'View all 12 months and evidence' : 'Ver os 12 meses e evidências',
      ),
    );
    expect(
      screen.getByRole('table', {
        name:
          locale === 'en'
            ? 'Monthly asking medians and evidence'
            : 'Medianas mensais de pedido e evidências',
      }),
    ).toBeVisible();
    expect(view.container.querySelectorAll('.place-series tbody tr')).toHaveLength(12);
    expect(view.container.querySelectorAll('.place-chart__subject')).toHaveLength(2);
    expect(screen.getByRole('img', { name: /Bela Vista.*Pinheiros/ })).toBeVisible();
    expect(
      await screen.findByText(
        locale === 'en' ? 'No recorded price reductions.' : 'Nenhuma redução de preço registrada.',
      ),
    ).toBeVisible();
    expect(
      screen.getByRole('link', {
        name: locale === 'en' ? 'All properties in Bela Vista' : 'Todos os imóveis em Bela Vista',
      }),
    ).toHaveAttribute('href', `/search/${bela.id}`);
  },
);
it('keeps genuine zero movement and days, unavailable values and an absent country parent', async () => {
  const { request, container } = mount();
  const base = request.getMockImplementation()!;
  request.mockImplementation(async (path) => {
    if (path.endsWith('/market')) {
      const market = marketFixture();
      return new Response(
        JSON.stringify({
          ...market,
          figures: {
            ...market.figures,
            askingPriceMovement: {
              ...market.figures.askingPriceMovement,
              state: 'available',
              value: 0,
              recordCount: 2000,
              sources: market.figures.listingsPerProperty.sources,
              freshness: market.figures.listingsPerProperty.freshness,
            },
            medianTimeOnMarketDays: { ...market.figures.medianTimeOnMarketDays, value: 0 },
          },
        }),
      );
    }
    return base(path);
  });
  await screen.findAllByText('0.0%');
  expect(container.querySelector('.place-days')).toHaveTextContent('0 days');
  expect(container.querySelector('.place-ratio')).toHaveTextContent('1.25');
  cleanup();
  mount('en', brasil.id, (path: string) => {
    if (path === `/api/v1/places/${brasil.id}`) return { metadata, place: brasil };
    if (path === `/api/v1/places/${brasil.id}/market`)
      return { ...marketFixture(brasil), parentMedian: null };
    if (path.endsWith('/monthly-series')) return seriesFixture(brasil);
    if (path.endsWith('/neighbours')) return { ...neighboursFixture(brasil), items: [] };
    return overviewFixture(path, brasil);
  });
  await screen.findByRole('heading', { name: 'Brasil' });
  expect(screen.queryByRole('region', { name: /Parent median/ })).not.toBeInTheDocument();
});
it('converts percentage points only for display without altering counts', async () => {
  const { container } = mount('en', bela.id, (path) => {
    if (!path.endsWith('/market')) return overviewFixture(path);
    const market = marketFixture();
    return {
      ...market,
      figures: {
        ...market.figures,
        askingPriceMovement: { ...market.figures.listingsPerProperty, windowMonths: 6, value: 3.1 },
        priceReductions: {
          ...market.figures.priceReductions,
          value: { count: 250, percentage: 10 },
        },
      },
    };
  });
  await screen.findByText('R$ 9,515');
  expect(container.querySelector('.place-movement .fig__value')).toHaveTextContent('+3.1%');
  expect(container.querySelector('.place-reductions30')).toHaveTextContent(
    '2,500 contributing listings',
  );
  expect(container.querySelector('.place-reductions30')).toHaveTextContent('+10.0%');
});
it('preserves a zero quantity in the metric presenter instead of replacing it with unavailability', () => {
  render(
    <I18nextProvider i18n={createLocale('en')}>
      <OverviewMetric
        label="Listings per property"
        value="0"
        evidence={marketFixture().figures.listingsPerProperty}
      />
    </I18nextProvider>,
  );
  expect(screen.getByText('0')).toBeVisible();
  expect(screen.queryByText('Not enough data')).not.toBeInTheDocument();
});
it.each(['neighbours', 'monthly-series', 'largest-reductions'] as const)(
  'recovers initial malformed and cached failed %s independently',
  async (section) => {
    const { request, cache, container } = mount();
    const base = request.getMockImplementation()!;
    let failing = true;
    request.mockImplementation(async (path) =>
      path.includes(section) && failing ? new Response('{}') : base(path),
    );
    await screen.findByText('R$ 9,515');
    const panel = container.querySelector<HTMLElement>(
      section === 'neighbours'
        ? '.place-neighbours'
        : section === 'monthly-series'
          ? '.place-series'
          : '.place-reductions',
    )!;
    expect(await within(panel).findByRole('alert')).not.toHaveTextContent('{}');
    const draft = screen.getByRole('textbox');
    await userEvent.type(draft, 'Keep this draft');
    failing = false;
    await userEvent.click(within(panel).getByRole('button', { name: 'Try again' }));
    await within(panel).findAllByText(
      section === 'largest-reductions'
        ? 'No recorded price reductions.'
        : 'Prepared market example',
    );
    failing = true;
    await act(async () => {
      await cache.refetchQueries({
        queryKey: [
          'place',
          bela.id,
          section === 'monthly-series'
            ? 'series'
            : section === 'largest-reductions'
              ? 'reductions'
              : section,
        ],
        exact: true,
      });
    });
    expect(await within(panel).findByRole('alert')).toBeVisible();
    expect(draft).toHaveValue('Keep this draft');
    expect(screen.getByText('R$ 9,515')).toBeVisible();
    expect(
      within(panel).getAllByText(
        section === 'largest-reductions'
          ? 'No recorded price reductions.'
          : 'Prepared market example',
      )[0],
    ).toBeVisible();
  },
);
it('retains persisted history if property enrichment fails and retries only the detail', async () => {
  const { request, container } = mount();
  const base = request.getMockImplementation()!;
  let failing = true;
  request.mockImplementation(async (path) =>
    path.includes('largest-reductions')
      ? new Response(JSON.stringify(reductionsFixture))
      : path.endsWith(propertyId)
        ? new Response(failing ? '{}' : JSON.stringify(propertyFixture))
        : base(path),
  );
  await screen.findByRole('heading', { name: 'Largest price reductions' });
  const panel = container.querySelector<HTMLElement>('.place-reductions')!;
  expect(await within(panel).findByText(/10.3%/)).toBeVisible();
  expect(within(panel).getByText(/R\$ 700,000.00.*R\$ 628,000.00/)).toBeVisible();
  expect(await within(panel).findByRole('alert')).toBeVisible();
  expect(within(panel).getByText('Sources: synthetic-data')).toHaveAttribute(
    'href',
    'https://synthetic.invalid/listing',
  );
  failing = false;
  await userEvent.click(within(panel).getByRole('button', { name: 'Try again' }));
  expect(await within(panel).findByRole('link', { name: /Apartment/ })).toHaveAttribute(
    'href',
    `/search/${bela.id}`,
  );
  expect(request.mock.calls.filter(([path]) => path.includes('largest-reductions'))).toHaveLength(
    1,
  );
});
it('forwards a trimmed escaped draft only to matching Ask state without writes or storage', async () => {
  const { request } = mount();
  await screen.findByText('R$ 9,515');
  const question = screen.getByRole('textbox', { name: 'Ask about Bela Vista' });
  await userEvent.type(question, '   ');
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(screen.getByLabelText('URL')).toHaveTextContent(`/places/${bela.id}`);
  await userEvent.clear(question);
  await userEvent.type(question, '  <img src=x> São Paulo 🏘  ');
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(await screen.findByText('<img src=x> São Paulo 🏘')).toBeVisible();
  expect(
    screen.getByText('Draft only. This question has not been submitted or executed.'),
  ).toBeVisible();
  expect(screen.getByLabelText('URL')).toHaveTextContent(`/ask/${bela.id}`);
  expect(screen.getByLabelText('URL')).not.toHaveTextContent('img');
  expect(document.querySelector('img')).toBeNull();
  expect(localStorage.getItem('questionDraft')).toBeNull();
  expect(request.mock.calls.every(([path]) => path.startsWith('/api/v1/places'))).toBe(true);
});
it('aborts all delayed old-place auxiliary reads and clears draft on navigation', async () => {
  const { request } = mount();
  const base = request.getMockImplementation()!;
  const signals: AbortSignal[] = [];
  request.mockImplementation(async (path: string, ...rest: unknown[]) => {
    if (path.includes(bela.id) && /neighbours|monthly-series|largest-reductions/.test(path)) {
      const signal = (rest[0] as RequestInit).signal!;
      signals.push(signal);
      return new Promise<Response>((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {
          once: true,
        }),
      );
    }
    return base(path);
  });
  await screen.findByText('R$ 9,515');
  await userEvent.type(screen.getByRole('textbox'), 'Old draft');
  await userEvent.click(
    within(screen.getByRole('navigation', { name: 'Place navigation' })).getByRole('link', {
      name: 'Pinheiros',
    }),
  );
  await screen.findByRole('heading', { name: 'Pinheiros' });
  expect(signals).toHaveLength(3);
  expect(signals.every((signal) => signal.aborted)).toBe(true);
  expect(screen.getByRole('textbox')).toHaveValue('');
  expect(screen.queryByText('R$ 9,515')).not.toBeInTheDocument();
  expect(await screen.findByText('No registered neighbouring places.')).toBeVisible();
});
