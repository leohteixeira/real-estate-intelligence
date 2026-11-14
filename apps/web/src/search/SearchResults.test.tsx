// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, useNavigate, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../routes';
import { createLocale } from '../places/locale';
import { createReadCache } from '../places/place-queries';
import { bela, metadata, placesFixture } from '../places/place-fixtures.test';
import { propertyFixture } from '../places/overview-fixtures.test';
import type { PlaceDetail, SearchResponse } from '@rei/contracts';

// The filter editor waits 400 ms after the last edit before counting, so every count in these
// tests takes that long by design; the defaults (1 s per query, 5 s per test) assume no delay.
configure({ asyncUtilTimeout: 5_000 });
vi.setConfig({ testTimeout: 30_000 });
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
});
const row = propertyFixture.property.summary;
const blockPlace: PlaceDetail = {
  ...bela,
  id: 'bela-block',
  kind: 'street-block',
  name: { ptBR: 'Rua Bela — quadra 1', en: 'Rua Bela — block 1' },
  parentId: bela.id,
  breadcrumbs: [...bela.breadcrumbs, { id: bela.id, kind: bela.kind, name: bela.name }],
};
export const searchFixture: SearchResponse = {
  metadata,
  items: [row],
  totalItems: 1,
  nextCursor: null,
  medianPricePerSquareMeter: 951220,
  placeCounts: [],
};
function History() {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <>
      <output aria-label="URL">
        {location.pathname}
        {location.search}
      </output>
      <button onClick={() => navigate(-1)}>Back</button>
      <button onClick={() => navigate(1)}>Forward</button>
    </>
  );
}
function mount(path = `/search/${bela.id}`, locale: 'pt-BR' | 'en' = 'pt-BR') {
  const cache = createReadCache();
  caches.push(cache);
  const i18n = createLocale(locale);
  render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={cache}>
        <MemoryRouter initialEntries={[path]}>
          <History />
          <AppRoutes />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
  return { cache, i18n };
}
function reads(
  search: (
    query: URLSearchParams,
    signal: AbortSignal,
  ) => SearchResponse | Response | Promise<SearchResponse | Response> = () => searchFixture,
  place: PlaceDetail = bela,
) {
  const request = vi.fn(async (input: string, options: RequestInit) => {
    const url = new URL(input, 'http://localhost');
    const result =
      url.pathname === '/api/v1/properties'
        ? await search(url.searchParams, options.signal as AbortSignal)
        : (placesFixture(input) ??
          (input.endsWith('/children')
            ? {
                metadata,
                items:
                  input.endsWith(`/${bela.id}/children`) && place.kind === 'street-block'
                    ? [place]
                    : [],
              }
            : { metadata, place }));
    return result instanceof Response ? result : new Response(JSON.stringify(result));
  });
  vi.stubGlobal('fetch', request);
  return request;
}
describe('contract-backed Search surface', () => {
  it('associates an invalid range only with the fields requiring correction', async () => {
    reads();
    mount(`/search/${bela.id}?view=filters`);
    await screen.findByRole('button', { name: 'Mostrar 1 imóvel' });
    await userEvent.type(document.getElementById('minArea')!, '999');
    await userEvent.type(document.getElementById('maxArea')!, '1');
    expect(document.getElementById('minArea')).toHaveAttribute('aria-describedby', 'draft-error');
    expect(document.getElementById('maxArea')).toHaveAttribute('aria-invalid', 'true');
    expect(document.getElementById('minAskingPrice')).toHaveAttribute('aria-invalid', 'false');
    expect(document.getElementById('minPricePerSquareMeter')).not.toHaveAttribute(
      'aria-describedby',
    );
  });
  it.each([
    ['pt-BR', 'abc', 'Número inválido. Use o formato 600.000,50, dentro dos limites aceitos.'],
    [
      'pt-BR',
      '600,000.50',
      'Número inválido. Use o formato 600.000,50, dentro dos limites aceitos.',
    ],
    ['en', '600.000,50', 'Invalid number. Use the 600,000.50 format, within the accepted bounds.'],
  ] as const)(
    'reports a %s value %s that is not a number on its own field only',
    async (locale, value, message) => {
      reads();
      mount(`/search/${bela.id}?view=filters`, locale);
      await screen.findByRole('button', {
        name: locale === 'en' ? 'Show 1 property' : 'Mostrar 1 imóvel',
      });
      await userEvent.type(document.getElementById('minAskingPrice')!, value);
      const field = document.getElementById('minAskingPrice')!;
      expect(field).toHaveAttribute('aria-invalid', 'true');
      expect(field).toHaveAttribute('aria-describedby', 'minAskingPrice-error');
      expect(document.getElementById('minAskingPrice-error')).toHaveTextContent(message);
      expect(screen.getAllByRole('alert')).toHaveLength(1);
      expect(document.getElementById('draft-error')).toBeNull();
      const other = document.getElementById('maxAskingPrice')!;
      expect(other).toHaveAttribute('aria-invalid', 'false');
      expect(other).not.toHaveAttribute('aria-describedby');
      expect(
        screen.getByRole('button', { name: locale === 'en' ? 'Apply filters' : 'Aplicar filtros' }),
      ).toBeDisabled();
    },
  );
  it('names an out-of-bounds area on its field and keeps the range message for a reversed range', async () => {
    reads();
    mount(`/search/${bela.id}?view=filters`);
    await screen.findByRole('button', { name: 'Mostrar 1 imóvel' });
    await userEvent.type(document.getElementById('minArea')!, '0');
    expect(document.getElementById('minArea-error')).toHaveTextContent('Use o formato 82,5');
    await userEvent.clear(document.getElementById('minArea')!);
    await userEvent.type(document.getElementById('minArea')!, '90');
    await userEvent.type(document.getElementById('maxArea')!, '82');
    expect(document.getElementById('minArea-error')).toBeNull();
    expect(document.getElementById('draft-error')).toHaveTextContent(
      'Confira os limites: o mínimo deve ser menor ou igual ao máximo.',
    );
  });
  it.each([
    ['pt-BR', 'priceReduced=true', '1 filtro aplicado', '1 de 5 imóveis'],
    ['pt-BR', 'priceReduced=true&minBedrooms=1', '2 filtros aplicados', '1 de 5 imóveis'],
    ['pt-BR', '', '0 filtros aplicados', '1 de 1 imóvel'],
    ['en', 'priceReduced=true', '1 filter applied', '1 of 5 properties'],
    ['en', 'priceReduced=true&minBedrooms=1', '2 filters applied', '1 of 5 properties'],
    ['en', '', '0 filters applied', '1 of 1 property'],
  ] as const)(
    'agrees %s applied filters and the counted noun with their numbers for "%s"',
    async (locale, search, applied, count) => {
      reads((query) => ({
        ...searchFixture,
        totalItems: query.has('priceReduced') ? 1 : search ? 5 : 1,
      }));
      mount(`/search/${bela.id}${search ? `?${search}` : ''}`, locale);
      expect(await screen.findByText(count)).toBeVisible();
      expect(screen.getByText(applied)).toBeVisible();
    },
  );
  it.each([
    ['pt-BR', 'O filtro Preço reduzido elimina o último imóvel.'],
    ['en', 'The Price reduced filter excludes the last property.'],
  ] as const)('uses the singular for one excluded property in %s', async (locale, message) => {
    reads((query) => ({
      ...searchFixture,
      items: query.has('priceReduced') ? [] : [row],
      totalItems: query.has('priceReduced') ? 0 : 1,
    }));
    mount(`/search/${bela.id}?priceReduced=true`, locale);
    expect(await screen.findByText(message)).toBeVisible();
  });
  it('opens a property from a row inside the application and moves focus to the content', async () => {
    reads();
    mount();
    await screen.findByText('R$ 9.512');
    await userEvent.click(document.querySelector<HTMLElement>('.search-rows a.prow')!);
    expect(screen.getByLabelText('URL')).toHaveTextContent(`/properties/${row.id}`);
    await waitFor(() =>
      expect(document.activeElement).toBe(document.getElementById('public-content')),
    );
  });
  it('closes the editor with Escape like the close link, except from a select', async () => {
    reads();
    mount(`/search/${bela.id}?priceReduced=false`);
    await userEvent.click(await screen.findByRole('link', { name: 'Filtros' }));
    await screen.findByRole('button', { name: 'Mostrar 1 imóvel' });
    screen.getByLabelText('Preço reduzido').focus();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByLabelText('URL')).toHaveTextContent('view=filters');
    await userEvent.click(document.getElementById('minArea')!);
    await userEvent.keyboard('{Escape}');
    expect(screen.getByLabelText('URL')).toHaveTextContent(`/search/${bela.id}?priceReduced=false`);
    expect(screen.getByLabelText('URL')).not.toHaveTextContent('view=filters');
    await waitFor(() =>
      expect(document.activeElement).toBe(document.getElementById('search-filters-link')),
    );
  });
  it.each([
    ['pt-BR', 'minBedrooms=101&unknown=1', 'Parâmetros recusados: minBedrooms, unknown.'],
    ['pt-BR', 'minArea=abc', 'Parâmetro recusado: minArea.'],
    ['en', 'minArea=2&maxArea=1', 'Refused parameters: minArea, maxArea.'],
    ['en', 'sort=wrong', 'Refused parameter: sort.'],
  ] as const)(
    'names the refused %s parameters of "%s" under the place heading',
    async (locale, search, message) => {
      reads();
      mount(`/search/${bela.id}?${search}`, locale);
      expect(screen.getByRole('alert')).toHaveTextContent(message);
      expect(await screen.findByRole('heading', { level: 1, name: 'Bela Vista' })).toBeVisible();
      expect(
        screen.getByRole('heading', {
          level: 2,
          name: locale === 'en' ? 'Invalid filters' : 'Filtros inválidos',
        }),
      ).toBeVisible();
    },
  );
  it.each([
    ['pt-BR', 0, '0 de 0 imóveis'],
    ['pt-BR', 1, '1 de 1 imóvel'],
    ['pt-BR', 2, '2 de 2 imóveis'],
    ['en', 0, '0 of 0 properties'],
    ['en', 1, '1 of 1 property'],
    ['en', 2, '2 of 2 properties'],
  ] as const)('pluralizes the current %s result count %i', async (locale, count, label) => {
    reads(() => ({ ...searchFixture, items: count === 0 ? [] : [row], totalItems: count }));
    mount(undefined, locale);
    expect(await screen.findByText(label)).toBeVisible();
  });
  it('keeps all hierarchy identifiers and names, most-specific first, with a complete selected hint', async () => {
    const block = blockPlace;
    reads(undefined, block);
    mount(`/search/${block.id}?view=filters`);
    await screen.findByRole('button', { name: 'Mostrar 1 imóvel' });
    const select = screen.getByLabelText('Lugar');
    await waitFor(() => expect(within(select).getAllByRole('option')).toHaveLength(8));
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => ({
          value: (option as HTMLOptionElement).value,
          label: option.textContent,
        })),
    ).toEqual(
      expect.arrayContaining([
        { value: 'brasil', label: 'Brasil' },
        { value: 'sao-paulo-state', label: 'São Paulo / Brasil' },
        { value: 'sao-paulo', label: 'São Paulo / São Paulo / Brasil' },
        { value: 'sao-paulo-centro', label: 'Centro / São Paulo / São Paulo / Brasil' },
        { value: 'sao-paulo-oeste', label: 'Oeste / São Paulo / São Paulo / Brasil' },
        { value: bela.id, label: 'Bela Vista / Centro / São Paulo / São Paulo / Brasil' },
        {
          value: 'sao-paulo-pinheiros',
          label: 'Pinheiros / Oeste / São Paulo / São Paulo / Brasil',
        },
        {
          value: block.id,
          label: 'Rua Bela — quadra 1 / Bela Vista / Centro / São Paulo / São Paulo / Brasil',
        },
      ]),
    );
    const expected = 'Rua Bela — quadra 1 / Bela Vista / Centro / São Paulo / São Paulo / Brasil';
    expect(within(select).getByRole('option', { name: expected })).toHaveValue(block.id);
    expect(document.querySelector('.search-filters__path')).toHaveTextContent(expected);
    expect(within(select).getByRole('option', { name: 'Brasil' })).toHaveValue('brasil');
    expect(
      within(select).getByRole('option', {
        name: 'Bela Vista / Centro / São Paulo / São Paulo / Brasil',
      }),
    ).toHaveValue(bela.id);
    await userEvent.selectOptions(select, bela.id);
    expect(document.querySelector('.search-filters__path')).toHaveTextContent(
      'Bela Vista / Centro / São Paulo / São Paulo / Brasil',
    );
    await screen.findByRole('button', { name: 'Mostrar 1 imóvel' });
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar 1 imóvel' }));
    expect(screen.getByLabelText('URL')).toHaveTextContent(`/search/${bela.id}`);
  });
  it.each(['neighborhood', 'street-block', 'city', 'zone'] as const)(
    'uses an actual prepared neighborhood comparison only when identifiable for %s',
    async (kind) => {
      const place: PlaceDetail =
        kind === 'street-block'
          ? blockPlace
          : kind === 'city'
            ? placesFixture('/api/v1/places/sao-paulo-state/children')!.items[0]!
            : kind === 'zone'
              ? placesFixture('/api/v1/places/sao-paulo/children')!.items[0]!
              : bela;
      const request = reads(
        (query) => ({
          ...searchFixture,
          medianPricePerSquareMeter:
            query.get('placeId') === bela.id && !query.has('minBedrooms') ? 1000000 : 951220,
        }),
        place,
      );
      mount(`/search/${place.id}?minBedrooms=1`);
      await screen.findByText('R$ 9.512');
      if (kind === 'neighborhood' || kind === 'street-block') {
        expect(await screen.findByText('Mediana do bairro Bela Vista: R$ 10.000')).toBeVisible();
        expect(
          request.mock.calls.some(
            ([url]) => new URL(url, 'http://localhost').searchParams.get('placeId') === bela.id,
          ),
        ).toBe(true);
      } else {
        expect(screen.queryByText(/Mediana do bairro/)).not.toBeInTheDocument();
        expect(
          request.mock.calls
            .filter(([url]) => url.includes('/properties'))
            .every(
              ([url]) => new URL(url, 'http://localhost').searchParams.get('placeId') === place.id,
            ),
        ).toBe(true);
      }
    },
  );
  it('retries a failed neighborhood comparison independently without losing actual block results', async () => {
    const place = blockPlace;
    let failing = true;
    const request = reads(
      (query) =>
        query.get('placeId') === bela.id
          ? failing
            ? new Response('private', { status: 503 })
            : { ...searchFixture, medianPricePerSquareMeter: 1000000 }
          : searchFixture,
      place,
    );
    mount(`/search/${place.id}`);
    await screen.findByText('R$ 9.512');
    expect(await screen.findByText('Não foi possível carregar a mediana do bairro.')).toBeVisible();
    expect(document.querySelectorAll('.prow')).toHaveLength(1);
    const resultReads = request.mock.calls.filter(
      ([url]) => new URL(url, 'http://localhost').searchParams.get('placeId') === place.id,
    ).length;
    failing = false;
    await userEvent.click(
      within(
        screen
          .getByText('Não foi possível carregar a mediana do bairro.')
          .closest('.system-state')!,
      ).getByRole('button', { name: 'Tentar de novo' }),
    );
    expect(await screen.findByText('Mediana do bairro Bela Vista: R$ 10.000')).toBeVisible();
    expect(document.querySelectorAll('.prow')).toHaveLength(1);
    expect(
      request.mock.calls.filter(
        ([url]) => new URL(url, 'http://localhost').searchParams.get('placeId') === place.id,
      ),
    ).toHaveLength(resultReads);
  });
  it.each(['pt-BR', 'en'] as const)(
    'renders %s prepared result median, semantic rows and evidence without details or event-fed reads',
    async (locale) => {
      const request = reads();
      mount(undefined, locale);
      expect(await screen.findByRole('heading', { name: 'Bela Vista' })).toBeVisible();
      expect(await screen.findByText(locale === 'en' ? 'R$ 9,512' : 'R$ 9.512')).toBeVisible();
      expect(
        screen.getByRole('list', { name: locale === 'en' ? 'Properties' : 'Imóveis' }),
      ).toHaveTextContent('Rua Bela');
      expect(document.querySelectorAll('.prow[href]')).toHaveLength(1);
      // The rows are persisted synthetic data, as the place page says; never "prepared".
      const band = document.querySelector<HTMLElement>('.search-median')!;
      expect(
        within(band).getByText(/^(?:Persisted synthetic data|Dados sintéticos persistidos)$/),
      ).toHaveTextContent(
        locale === 'en' ? 'Persisted synthetic data' : 'Dados sintéticos persistidos',
      );
      expect(band).toHaveTextContent(
        locale === 'en'
          ? 'Neighborhood median for Bela Vista: R$ 9,512'
          : 'Mediana do bairro Bela Vista: R$ 9.512',
      );
      expect(document.getElementById('search-results')).not.toHaveTextContent(/prepared|preparad/i);
      expect(
        await screen.findByText(locale === 'en' ? '1 of 1 property' : '1 de 1 imóvel'),
      ).toBeVisible();
      // Results, place total and neighborhood comparison share the one unfiltered read.
      expect(request.mock.calls.filter(([url]) => url.includes('/properties?'))).toHaveLength(1);
      await userEvent.click(
        screen.getByText(
          locale === 'en' ? 'Evidence for these results' : 'Evidências destes resultados',
        ),
      );
      expect(screen.getByText(/test-v1/)).toBeVisible();
      expect(screen.getByText(/contribuinte|contributing/)).toHaveTextContent(
        locale === 'en' ? 'does not report' : 'não informa',
      );
      expect(
        request.mock.calls.some(([url]) => url.includes('/market') || /properties\//.test(url)),
      ).toBe(false);
    },
  );
  it('rejects malformed URLs and clears to a genuine valid search without forwarding them', async () => {
    const request = reads();
    mount(`/search/${bela.id}?priceReduced=true&priceReduced=false`);
    expect(screen.getByRole('alert')).toHaveTextContent('Filtros inválidos');
    expect(request.mock.calls.some(([url]) => url.includes('/properties'))).toBe(false);
    await userEvent.click(screen.getByRole('link', { name: 'Limpar filtros' }));
    await screen.findByText('R$ 9.512');
    expect(
      request.mock.calls
        .filter(([url]) => url.includes('/properties?'))
        .every(([url]) => !url.includes('priceReduced')),
    ).toBe(true);
  });
  it('edits and clears only a draft, cancels unchanged, applies false and navigates history', async () => {
    const request = reads();
    mount(`/search/${bela.id}?priceReduced=false`);
    await screen.findByText('R$ 9.512');
    expect(screen.getByRole('button', { name: /Preço reduzido: Não/ })).toBeVisible();
    await userEvent.click(screen.getByRole('link', { name: 'Filtros' }));
    await screen.findByRole('button', { name: 'Mostrar 1 imóvel' });
    await userEvent.selectOptions(screen.getByLabelText('Preço reduzido'), 'true');
    await userEvent.click(screen.getByRole('link', { name: 'Fechar filtros' }));
    expect(screen.getByLabelText('URL')).toHaveTextContent('priceReduced=false');
    await userEvent.click(screen.getByRole('link', { name: 'Filtros' }));
    expect(screen.getByLabelText('Preço reduzido')).toHaveValue('false');
    await userEvent.click(screen.getByRole('button', { name: 'Limpar tudo' }));
    expect(screen.getByLabelText('URL')).toHaveTextContent('priceReduced=false');
    await screen.findByRole('button', { name: 'Mostrar 1 imóvel' });
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar 1 imóvel' }));
    expect(screen.getByLabelText('URL')).not.toHaveTextContent('priceReduced');
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByLabelText('URL')).toHaveTextContent('view=filters');
    expect(request.mock.calls.some(([url]) => url.includes('priceReduced=false'))).toBe(true);
  });
  it('validates ranges before requests and converts money/area exactly', async () => {
    const request = reads();
    mount(`/search/${bela.id}?view=filters`);
    await screen.findByRole('button', { name: 'Mostrar 1 imóvel' });
    await userEvent.type(screen.getByLabelText('Preço pedido (R$) — Mínimo'), '600.000,50');
    await userEvent.type(screen.getByLabelText('Área (m²) — Mínimo'), '82,5');
    await screen.findByRole('button', { name: 'Mostrar 1 imóvel' });
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar 1 imóvel' }));
    expect(screen.getByLabelText('URL')).toHaveTextContent('minAskingPrice=60000050');
    expect(screen.getByLabelText('URL')).toHaveTextContent('minArea=82.5');
    expect(
      request.mock.calls.some(
        ([url]) => url.includes('minAskingPrice=60000050') && url.includes('minArea=82.5'),
      ),
    ).toBe(true);
    await userEvent.click(screen.getByRole('link', { name: 'Filtros' }));
    await userEvent.type(screen.getByLabelText('Área (m²) — Máximo'), '1');
    expect(screen.getByRole('alert')).toHaveTextContent('Confira');
    expect(screen.getByRole('button', { name: 'Aplicar filtros' })).toBeDisabled();
  });
  it('attributes reduced/returned zero to returned, relaxes it and widens through real ancestry', async () => {
    reads((query) => ({
      ...searchFixture,
      items: query.has('returnedToMarket') ? [] : [row],
      totalItems: query.has('returnedToMarket') ? 0 : query.has('priceReduced') ? 3 : 5,
      medianPricePerSquareMeter: query.has('returnedToMarket') ? null : 951220,
    }));
    mount(`/search/${bela.id}?priceReduced=true&returnedToMarket=true`);
    expect(await screen.findByText(/elimina os últimos 3 imóveis/)).toHaveTextContent(
      'Voltou ao mercado',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Relaxar Voltou ao mercado' }));
    expect(screen.getByLabelText('URL')).toHaveTextContent('priceReduced=true');
    expect(screen.getByLabelText('URL')).not.toHaveTextContent('returnedToMarket');
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    await screen.findByText(/elimina os últimos 3 imóveis/);
    await userEvent.click(screen.getByRole('button', { name: 'Ampliar para Centro' }));
    expect(screen.getByLabelText('URL')).toHaveTextContent(
      '/search/sao-paulo-centro?priceReduced=true&returnedToMarket=true',
    );
  });
  it('uses neutral empty wording and independent explicit retries for failed attribution and results', async () => {
    let failing = true;
    reads((query) =>
      query.has('priceReduced')
        ? { ...searchFixture, items: [], totalItems: 0, medianPricePerSquareMeter: null }
        : failing
          ? new Response('private', { status: 503 })
          : { ...searchFixture, items: [], totalItems: 0, medianPricePerSquareMeter: null },
    );
    mount(`/search/${bela.id}?priceReduced=true`);
    expect(
      await screen.findByText('Não foi possível identificar o filtro responsável.'),
    ).toBeVisible();
    expect(screen.queryByText(/elimina os últimos/)).not.toBeInTheDocument();
    failing = false;
    await userEvent.click(
      within(document.querySelector<HTMLElement>('.search-empty')!).getByRole('button', {
        name: 'Tentar de novo',
      }),
    );
    expect(await screen.findByText('Nenhum imóvel neste lugar atende à busca.')).toBeVisible();
  });
  it('counts a typed draft once after it rests instead of once per keystroke', async () => {
    const request = reads();
    mount(`/search/${bela.id}?view=filters`);
    await screen.findByRole('button', { name: 'Mostrar 1 imóvel' });
    const counts = () =>
      request.mock.calls.filter(([url]) => url.includes('minAskingPrice=')).map(([url]) => url);
    await userEvent.type(screen.getByLabelText('Preço pedido (R$) — Mínimo'), '600000');
    expect(screen.getByRole('button', { name: 'Contando imóveis…' })).toBeDisabled();
    expect(counts()).toHaveLength(0);
    await screen.findByRole('button', { name: 'Mostrar 1 imóvel' });
    expect(counts()).toHaveLength(1);
    expect(counts()[0]).toContain('minAskingPrice=60000000');
  });
  it('ignores obsolete draft counts, blocks Apply only while counting and applies after a failed count', async () => {
    let signal: AbortSignal | undefined;
    const request = reads(async (query, currentSignal) => {
      if (query.get('propertyType') === 'studio') {
        signal = currentSignal;
        return new Promise<SearchResponse>(() => {});
      }
      if (query.get('propertyType') === 'land') return new Response('private', { status: 503 });
      return searchFixture;
    });
    mount(`/search/${bela.id}?view=filters`);
    await screen.findByRole('button', { name: 'Mostrar 1 imóvel' });
    await userEvent.click(screen.getByRole('button', { name: 'Estúdio' }));
    await waitFor(() => expect(signal).toBeDefined());
    expect(screen.getByRole('button', { name: 'Contando imóveis…' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Terreno' }));
    expect(signal?.aborted).toBe(true);
    expect(
      await screen.findByText(
        'Não foi possível contar os imóveis deste rascunho. Os filtros ainda podem ser aplicados.',
      ),
    ).toBeVisible();
    expect(request.mock.calls.some(([url]) => url.includes('propertyType=studio'))).toBe(true);
    // A failed count offers its own retry and never blocks applying the valid draft.
    const landCounts = () =>
      request.mock.calls.filter(([url]) => url.includes('propertyType=land')).length;
    const failed = landCounts();
    await userEvent.click(
      within(document.querySelector<HTMLElement>('.search-filters')!).getByRole('button', {
        name: 'Tentar de novo',
      }),
    );
    await waitFor(() => expect(landCounts()).toBe(failed + 1));
    const apply = await screen.findByRole('button', { name: 'Aplicar filtros' });
    expect(apply).toBeEnabled();
    await userEvent.click(apply);
    expect(screen.getByLabelText('URL')).toHaveTextContent(`/search/${bela.id}?propertyType=land`);
  });
  it('appends actual pages, retries next-page errors without discarding rows, and resets on sorting', async () => {
    let failure = true;
    const request = reads((query) =>
      query.has('cursor')
        ? failure
          ? new Response('private', { status: 503 })
          : {
              ...searchFixture,
              items: [{ ...row, id: '0199322b-2dc0-7000-8000-000000000099' }],
              totalItems: 2,
            }
        : { ...searchFixture, totalItems: 2, nextCursor: 'next' },
    );
    mount(`/search/${bela.id}?sort=furthest-below-median`);
    await screen.findByText('R$ 9.512');
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar mais imóveis' }));
    expect(await screen.findByText('Não foi possível carregar a próxima página.')).toBeVisible();
    expect(document.querySelectorAll('.prow')).toHaveLength(1);
    failure = false;
    await userEvent.click(
      within(document.querySelector<HTMLElement>('.search-next-error')!).getByRole('button', {
        name: 'Tentar de novo',
      }),
    );
    await waitFor(() => expect(document.querySelectorAll('.prow')).toHaveLength(2));
    await userEvent.selectOptions(screen.getByLabelText('Ordenar'), 'most-recent');
    await waitFor(() => expect(document.querySelectorAll('.prow')).toHaveLength(1));
    expect(screen.getByLabelText('URL')).toHaveTextContent('sort=most-recent');
    await userEvent.selectOptions(screen.getByLabelText('Ordenar'), 'furthest-below-median');
    await waitFor(() => expect(document.querySelectorAll('.prow')).toHaveLength(1));
    expect(screen.getByRole('button', { name: 'Mostrar mais imóveis' })).toBeVisible();
    const firstPages = request.mock.calls.filter(([input]) => {
      const url = new URL(input, 'http://localhost');
      return (
        url.pathname === '/api/v1/properties' &&
        url.searchParams.get('sort') === 'furthest-below-median' &&
        !url.searchParams.has('cursor')
      );
    });
    expect(firstPages).toHaveLength(2);
  });
  it('selects every property type and applies the final type through the query boundary', async () => {
    const request = reads();
    mount(`/search/${bela.id}?view=filters`);
    await screen.findByRole('button', { name: 'Mostrar 1 imóvel' });
    for (const name of ['Apartamento', 'Casa', 'Estúdio', 'Comercial', 'Terreno']) {
      await userEvent.click(screen.getByRole('button', { name }));
      await screen.findByRole('button', { name: 'Mostrar 1 imóvel' });
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'true');
    }
    await userEvent.click(screen.getByRole('button', { name: 'Apartamento' }));
    await screen.findByRole('button', { name: 'Mostrar 1 imóvel' });
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar 1 imóvel' }));
    expect(screen.getByLabelText('URL')).toHaveTextContent('propertyType=apartment');
    expect(request.mock.calls.some(([url]) => url.includes('propertyType=apartment'))).toBe(true);
  });
  it('sends all six typed numeric fields through the query boundary', async () => {
    const request = reads();
    mount(`/search/${bela.id}?view=filters`);
    await screen.findByRole('button', { name: 'Mostrar 1 imóvel' });
    for (const [name, value] of [
      ['Preço pedido (R$) — Mínimo', '600.000,50'],
      ['Preço pedido (R$) — Máximo', '900.000'],
      ['Preço pedido por m² (R$) — Mínimo', '9.000'],
      ['Preço pedido por m² (R$) — Máximo', '10.000'],
      ['Área (m²) — Mínimo', '80,5'],
      ['Área (m²) — Máximo', '82,5'],
    ])
      await userEvent.type(screen.getByRole('textbox', { name }), value!);
    await screen.findByRole('button', { name: 'Mostrar 1 imóvel' });
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar 1 imóvel' }));
    const expected = {
      minAskingPrice: '60000050',
      maxAskingPrice: '90000000',
      minPricePerSquareMeter: '900000',
      maxPricePerSquareMeter: '1000000',
      minArea: '80.5',
      maxArea: '82.5',
    };
    const applied = new URL(screen.getByLabelText('URL').textContent!, 'http://localhost')
      .searchParams;
    for (const [key, value] of Object.entries(expected)) expect(applied.get(key)).toBe(value);
    expect(
      request.mock.calls.some(([url]) =>
        Object.entries(expected).every(
          ([key, value]) => new URL(url, 'http://localhost').searchParams.get(key) === value,
        ),
      ),
    ).toBe(true);
  });
  it('combines room, market-time and flag edits with all existing numeric and type filters', async () => {
    const request = reads();
    mount(
      `/search/${bela.id}?propertyType=apartment&minAskingPrice=60000050&maxAskingPrice=90000000&minPricePerSquareMeter=900000&maxPricePerSquareMeter=1000000&minArea=80.5&maxArea=82.5&view=filters`,
    );
    await screen.findByRole('button', { name: 'Mostrar 1 imóvel' });
    await userEvent.click(
      within(screen.getByRole('group', { name: 'Quartos' })).getByRole('button', {
        name: '3+',
      }),
    );
    await userEvent.selectOptions(screen.getByLabelText('Banheiros'), '3');
    await userEvent.selectOptions(screen.getByLabelText('Vagas de garagem'), '2');
    for (const band of ['up-to-30', '31-to-90', 'over-90', 'over-180'])
      await userEvent.selectOptions(screen.getByLabelText('Tempo de anúncio'), band);
    for (const name of ['Preço reduzido', 'Voltou ao mercado', 'Mais de um anúncio'])
      await userEvent.click(screen.getByRole('button', { name }));
    await screen.findByRole('button', { name: 'Mostrar 1 imóvel' });
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar 1 imóvel' }));
    const expected = {
      propertyType: 'apartment',
      minAskingPrice: '60000050',
      maxAskingPrice: '90000000',
      minPricePerSquareMeter: '900000',
      maxPricePerSquareMeter: '1000000',
      minArea: '80.5',
      maxArea: '82.5',
      minBedrooms: '3',
      minBathrooms: '3',
      minParkingSpaces: '2',
      timeOnMarket: 'over-180',
      priceReduced: 'true',
      returnedToMarket: 'true',
      multipleListings: 'true',
    };
    const applied = new URL(screen.getByLabelText('URL').textContent!, 'http://localhost')
      .searchParams;
    for (const [key, value] of Object.entries(expected)) expect(applied.get(key)).toBe(value);
    expect(
      request.mock.calls.some(([url]) =>
        Object.entries(expected).every(
          ([key, value]) => new URL(url, 'http://localhost').searchParams.get(key) === value,
        ),
      ),
    ).toBe(true);
  });
  it('preserves the complete combined filters through every ordering and removes the area range', async () => {
    const request = reads();
    mount(
      `/search/${bela.id}?propertyType=apartment&minAskingPrice=60000050&maxAskingPrice=90000000&minPricePerSquareMeter=900000&maxPricePerSquareMeter=1000000&minArea=80.5&maxArea=82.5&minBedrooms=3&minBathrooms=3&minParkingSpaces=2&timeOnMarket=over-180&priceReduced=true&returnedToMarket=true&multipleListings=true`,
    );
    await screen.findByText('R$ 9.512');
    for (const sort of [
      'furthest-below-median',
      'lowest-price-per-square-meter',
      'longest-on-market',
      'most-recent',
    ]) {
      await userEvent.selectOptions(screen.getByLabelText('Ordenar'), sort);
      await waitFor(() =>
        expect(
          request.mock.calls.some(
            ([url]) => new URL(url, 'http://localhost').searchParams.get('sort') === sort,
          ),
        ).toBe(true),
      );
    }
    await userEvent.click(screen.getByRole('button', { name: /Remover Área/ }));
    expect(screen.getByLabelText('URL')).not.toHaveTextContent('minArea');
    expect(screen.getByLabelText('URL')).not.toHaveTextContent('maxArea');
  });
  it('preserves compatible deep-link types, zero room minima and all explicit-false flags', async () => {
    reads();
    mount(
      `/search/${bela.id}?propertyType=other&minBedrooms=0&minBathrooms=0&minParkingSpaces=0&priceReduced=false&returnedToMarket=false&multipleListings=false&view=filters`,
    );
    await screen.findByRole('button', { name: 'Mostrar 1 imóvel' });
    expect(screen.getByRole('button', { name: 'Outro' })).toHaveAttribute('aria-pressed', 'true');
    expect(
      within(screen.getByRole('group', { name: 'Quartos' })).getByRole('button', {
        name: '0+',
      }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Banheiros')).toHaveValue('0');
    expect(screen.getByLabelText('Vagas de garagem')).toHaveValue('0');
    for (const label of ['Preço reduzido', 'Voltou ao mercado', 'Mais de um anúncio'])
      expect(screen.getByLabelText(label)).toHaveValue('false');
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar 1 imóvel' }));
    expect(screen.getByLabelText('URL')).toHaveTextContent('multipleListings=false');
  });
  it('keeps draft amounts valid when locale changes', async () => {
    reads();
    const { i18n } = mount(`/search/${bela.id}?minAskingPrice=60000050&view=filters`);
    await screen.findByRole('button', { name: 'Mostrar 1 imóvel' });
    await act(async () => {
      await i18n.changeLanguage('en');
    });
    expect(screen.getByLabelText('Asking price (R$) — Minimum')).toHaveValue('600,000.50');
    expect(await screen.findByRole('button', { name: 'Show 1 property' })).toBeEnabled();
  });
  it.each(['pt-BR', 'en'] as const)(
    'preserves valid numeric meaning in an invalid %s draft across locale changes',
    async (locale) => {
      const request = reads();
      const { i18n } = mount(`/search/${bela.id}?view=filters`, locale);
      await screen.findByRole('button', {
        name: locale === 'en' ? 'Show 1 property' : 'Mostrar 1 imóvel',
      });
      const minimumArea = document.getElementById('minArea')!;
      const minimumPrice = document.getElementById('minAskingPrice')!;
      await userEvent.type(minimumArea, locale === 'en' ? '1,234' : '1.234');
      await userEvent.type(minimumPrice, locale === 'en' ? '1.234' : '1,234');
      expect(screen.getByRole('alert')).toBeVisible();
      const calls = request.mock.calls.length;
      await act(async () => {
        await i18n.changeLanguage(locale === 'en' ? 'pt-BR' : 'en');
      });
      expect(minimumArea).toHaveValue(locale === 'en' ? '1.234' : '1,234');
      expect(minimumPrice).toHaveValue(locale === 'en' ? '1,234' : '1.234');
      expect(screen.getByRole('alert')).toBeVisible();
      expect(request.mock.calls).toHaveLength(calls);
      await userEvent.clear(minimumPrice);
      await screen.findByRole('button', {
        name: locale === 'en' ? 'Mostrar 1 imóvel' : 'Show 1 property',
      });
      await userEvent.click(
        screen.getByRole('button', {
          name: locale === 'en' ? 'Mostrar 1 imóvel' : 'Show 1 property',
        }),
      );
      expect(screen.getByLabelText('URL')).toHaveTextContent('minArea=1234');
      expect(request.mock.calls.some(([url]) => url.includes('minArea=1234'))).toBe(true);
      expect(request.mock.calls.some(([url]) => /minArea=1\.234(?:&|$)/.test(url))).toBe(false);
    },
  );
  it.each(['pt-BR', 'en'] as const)(
    'retains an inverted %s area range and its values after switching language',
    async (locale) => {
      reads();
      const { i18n } = mount(`/search/${bela.id}?view=filters`, locale);
      await screen.findByRole('button', {
        name: locale === 'en' ? 'Show 1 property' : 'Mostrar 1 imóvel',
      });
      await userEvent.type(
        document.getElementById('minArea')!,
        locale === 'en' ? '1,234.5' : '1.234,5',
      );
      await userEvent.type(
        document.getElementById('maxArea')!,
        locale === 'en' ? '1,000.5' : '1.000,5',
      );
      await act(async () => {
        await i18n.changeLanguage(locale === 'en' ? 'pt-BR' : 'en');
      });
      expect(document.getElementById('minArea')).toHaveValue(
        locale === 'en' ? '1.234,5' : '1,234.5',
      );
      expect(document.getElementById('maxArea')).toHaveValue(
        locale === 'en' ? '1.000,5' : '1,000.5',
      );
      expect(screen.getByRole('alert')).toBeVisible();
      expect(
        screen.getByRole('button', { name: locale === 'en' ? 'Aplicar filtros' : 'Apply filters' }),
      ).toBeDisabled();
      await userEvent.clear(document.getElementById('maxArea')!);
      await userEvent.click(
        await screen.findByRole('button', {
          name: locale === 'en' ? 'Mostrar 1 imóvel' : 'Show 1 property',
        }),
      );
      expect(screen.getByLabelText('URL')).toHaveTextContent('minArea=1234.5');
    },
  );
});
