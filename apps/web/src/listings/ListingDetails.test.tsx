// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseListingResponse, parsePropertyResponse } from '@rei/contracts';
import type { PropertyResponse } from '@rei/contracts';
import { AppRoutes } from '../routes';
import { createLocale } from '../places/locale';
import { createReadCache, listingQuery } from '../places/place-queries';
import { overviewFixture } from '../places/overview-fixtures.test';
import { propertyDetailFixture } from '../properties/property-fixtures.test';
import { listingHref, propertyHref } from '../properties/property-navigation';
import { formatComputedAt, formatExactMoney } from '../places/formatters';
import { verifiedListingProperty } from './listing-context';
import { listingFixture } from './listing-fixtures.test';

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
  vi.useRealTimers();
  localStorage.clear();
});
function History() {
  const location = useLocation(),
    navigate = useNavigate();
  return (
    <>
      <output aria-label="URL">
        {location.pathname}
        {location.search}
      </output>
      <button
        onClick={() => {
          void navigate(-1);
        }}
      >
        Back
      </button>
      <button
        onClick={() => {
          void navigate(1);
        }}
      >
        Forward
      </button>
    </>
  );
}
function mount(
  response = listingFixture(),
  options: {
    path?: string;
    locale?: 'pt-BR' | 'en';
    context?: PropertyResponse;
    contextStatus?: number;
    listingStatus?: number;
    contextResponse?: () => Promise<Response>;
  } = {},
) {
  const context = options.context ?? propertyDetailFixture();
  const request = vi.fn(async (input: string) => {
    if (input.startsWith('/api/v1/listings/'))
      return new Response(
        options.listingStatus ? 'private listing exception' : JSON.stringify(response),
        {
          status: options.listingStatus ?? 200,
          headers: { 'x-request-id': '0199a3e0-0000-7000-8000-000000000999' },
        },
      );
    if (input.startsWith('/api/v1/properties/') && options.contextResponse)
      return options.contextResponse();
    if (input.startsWith('/api/v1/properties/'))
      return new Response(
        options.contextStatus ? 'private context exception' : JSON.stringify(context),
        { status: options.contextStatus ?? 200 },
      );
    return new Response(JSON.stringify(overviewFixture(input)));
  });
  vi.stubGlobal('fetch', request);
  const cache = createReadCache();
  caches.push(cache);
  render(
    <I18nextProvider i18n={createLocale(options.locale ?? 'pt-BR')}>
      <QueryClientProvider client={cache}>
        <MemoryRouter initialEntries={[options.path ?? `/listings/${response.listing.id}`]}>
          <History />
          <AppRoutes />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
  return { request, cache };
}

describe('Listing public surface', () => {
  it.each([
    [
      'pt-BR',
      'Dados sintéticos — Aurora',
      'Anúncio sintético persistido; regras determinísticas de identidade',
    ],
    ['en', 'Synthetic data — Aurora', 'Persisted synthetic listing; deterministic identity rules'],
  ] as const)(
    'shows repository-owned labels and effective dates in the %s interface language',
    async (locale, source, evidence) => {
      const fixture = listingFixture();
      const response = parseListingResponse({
        ...fixture,
        listing: {
          ...fixture.listing,
          fixtureLabel: 'Persisted synthetic listing; deterministic identity rules',
          source: {
            ...fixture.listing.source,
            sourceId: 'synthetic-portal-aurora',
            label: 'Synthetic data — Aurora',
          },
        },
      });
      mount(response, { locale });
      await screen.findByRole('heading', { name: response.listing.street });
      const facts = screen.getByRole('region', {
        name: locale === 'en' ? 'Provenance' : 'Proveniência',
      });
      expect(within(facts).getByText(source)).toBeVisible();
      expect(facts.querySelector('details')).toHaveTextContent(evidence);
      const values = screen.getByRole('region', {
        name: locale === 'en' ? 'Values in this listing' : 'Valores neste anúncio',
      });
      const since = new Date(response.listing.fieldEffectiveAt.attributes);
      const expected = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'pt-BR', {
        dateStyle: locale === 'en' ? 'medium' : 'short',
        timeZone: 'UTC',
      }).format(since);
      expect(expected).toMatch(
        locale === 'en' ? /^\d{1,2} [A-Z][a-z]{2} \d{4}$/ : /^\d{2}\/\d{2}\/\d{4}$/,
      );
      expect(within(values).getAllByText(expected).length).toBeGreaterThan(0);
    },
  );
  it.each([
    ['pt-BR', 'Prepared synthetic fixture (supplementary description-denied branch)'],
    ['en', 'Prepared synthetic fixture (supplementary description-denied branch)'],
    ['pt-BR', 'Persisted synthetic evidence'],
    ['en', 'Persisted synthetic evidence'],
  ] as const)(
    'preserves the received %s evidence label verbatim: %s',
    async (locale, fixtureLabel) => {
      const fixture = listingFixture();
      const response = parseListingResponse({
        ...fixture,
        listing: { ...fixture.listing, fixtureLabel },
      });
      mount(response, { locale });
      await screen.findByRole('heading', { name: response.listing.street });
      const facts = screen.getByRole('region', {
        name: locale === 'en' ? 'Provenance' : 'Proveniência',
      });
      const disclosure = facts.querySelector('details')!;
      expect(within(disclosure).getByText(fixtureLabel)).not.toBeVisible();
      await userEvent.click(
        within(disclosure).getByText(
          locale === 'en' ? 'Identifiers and hash' : 'Identificadores e hash',
        ),
      );
      expect(within(disclosure).getByText(fixtureLabel)).toBeVisible();
      expect(disclosure).toHaveTextContent(
        locale === 'en' ? 'Synthetic evidence label' : 'Identificação da evidência sintética',
      );
      expect(
        within(disclosure).getByText(
          locale === 'en'
            ? /The received label distinguishes prepared from persisted synthetic evidence/
            : /A identificação recebida distingue evidência sintética preparada de persistida/,
        ),
      ).toBeVisible();
      expect(disclosure).toHaveTextContent(
        locale === 'en'
          ? 'Snapshot availability does not determine that origin.'
          : 'A disponibilidade do snapshot não determina essa origem.',
      );
    },
  );

  it.each(['pt-BR', 'en'] as const)(
    'renders source facts, all dated fields and original events in %s',
    async (locale) => {
      const response = listingFixture(),
        listing = response.listing;
      const originalHistory = structuredClone(listing.history);
      const { request } = mount(response, { locale });
      await screen.findByText(locale === 'en' ? '1 of 3' : '1 de 3');
      expect(document.title).toBe(
        `${locale === 'en' ? 'Listing' : 'Anúncio'} · Real Estate Intelligence`,
      );
      expect(screen.getByRole('heading', { name: listing.street })).toBeVisible();
      const facts = within(
        screen.getByRole('region', { name: locale === 'en' ? 'Provenance' : 'Proveniência' }),
      );
      expect(facts.getByText(listing.source.label)).toBeVisible();
      expect(facts.getByText(String(listing.collectionCount))).toBeVisible();
      expect(
        screen.getByText(
          `${formatExactMoney(listing.askingPriceMinorUnits, locale)} ÷ 82 m² = ${formatExactMoney(listing.pricePerSquareMeter!, locale)}/m²`,
        ),
      ).toBeVisible();
      expect(document.querySelectorAll('.listing-events > li')).toHaveLength(
        listing.history.length,
      );
      for (const event of listing.history)
        expect(
          screen.getAllByText(formatComputedAt(event.effectiveAt, locale)).length,
        ).toBeGreaterThan(0);
      const renderedEvents = Array.from(document.querySelectorAll('.listing-events > li'));
      expect(
        renderedEvents.map((row) => row.querySelector('time')?.getAttribute('datetime')),
      ).toEqual(
        listing.history
          .map((event) => event.effectiveAt)
          .toSorted((left, right) => Date.parse(right) - Date.parse(left)),
      );
      const creation = screen
        .getByRole('heading', { name: locale === 'en' ? 'Listing created' : 'Anúncio criado' })
        .closest('li')!;
      expect(listing.history).toEqual(originalHistory);
      const values = screen.getByRole('region', {
        name: locale === 'en' ? 'Values in this listing' : 'Valores neste anúncio',
      });
      const effectiveTimes = Array.from(values.querySelectorAll('tbody time'));
      expect(effectiveTimes.map((time) => time.getAttribute('datetime'))).toEqual([
        listing.fieldEffectiveAt.askingPrice,
        ...Array<string>(6).fill(listing.fieldEffectiveAt.attributes),
        listing.fieldEffectiveAt.description,
      ]);
      for (const time of effectiveTimes)
        expect(time).toHaveAttribute(
          'title',
          formatComputedAt(time.getAttribute('datetime')!, locale),
        );
      expect(creation).toHaveTextContent(
        locale === 'en'
          ? 'No dated initial price reported.'
          : 'Preço inicial datado não informado.',
      );
      expect(creation).not.toHaveTextContent('R$');
      expect(
        screen.getByText(
          locale === 'en' ? 'Removed does not mean sold.' : 'Removido não significa vendido.',
        ),
      ).toBeVisible();
      await userEvent.click(
        facts.getByText(locale === 'en' ? 'Identifiers and hash' : 'Identificadores e hash'),
      );
      expect(facts.getByText(listing.provenance.contentHash)).toBeVisible();
      const eventEvidence = creation.querySelector('details')!;
      await userEvent.click(
        within(eventEvidence).getByText(
          locale === 'en' ? 'Original event provenance' : 'Proveniência original do evento',
        ),
      );
      expect(
        within(eventEvidence).getByText(listing.history[0]!.provenance.snapshotId),
      ).toBeVisible();
      expect(
        request.mock.calls.filter(([url]) => url === `/api/v1/listings/${listing.id}`),
      ).toHaveLength(1);
      expect(
        request.mock.calls.filter(([url]) => url === `/api/v1/properties/${listing.propertyId}`),
      ).toHaveLength(1);
      for (const nav of screen.getAllByRole('navigation', {
        name: locale === 'en' ? 'Main navigation' : 'Navegação principal',
      }))
        expect(
          within(nav).getByRole('link', { name: locale === 'en' ? 'Search' : 'Buscar' }),
        ).toHaveAttribute('aria-current', 'page');
      expect(document.querySelector('.place-navigation')).toBeNull();
      expect(document.querySelector('a[download], .listing-details img')).toBeNull();
    },
  );

  it.each(['pt-BR', 'en'] as const)(
    'exposes all complete field-effective UTC times through a focusable native disclosure in %s',
    async (locale) => {
      const fixture = listingFixture();
      const attributes = '2026-05-14T09:37:00.000Z';
      const response = parseListingResponse({
        ...fixture,
        listing: {
          ...fixture.listing,
          fieldEffectiveAt: { ...fixture.listing.fieldEffectiveAt, attributes },
        },
      });
      const listing = response.listing;
      expect([listing.firstCollectedAt, listing.lastCollectedAt]).not.toContain(attributes);
      expect(listing.history.map((event) => event.effectiveAt)).not.toContain(attributes);
      mount(response, { locale });
      await screen.findByRole('heading', { name: listing.street });
      const disclosure = document.querySelector<HTMLDetailsElement>('.listing-effective-times')!;
      const summary = within(disclosure).getByText(
        locale === 'en' ? 'View complete times (UTC)' : 'Ver horários completos (UTC)',
      );
      expect(disclosure).not.toHaveAttribute('open');
      summary.focus();
      expect(summary).toHaveFocus();
      await userEvent.click(summary);
      expect(disclosure).toHaveAttribute('open');
      const times = Array.from(disclosure.querySelectorAll('time'));
      const expected = [
        listing.fieldEffectiveAt.askingPrice,
        ...Array<string>(6).fill(attributes),
        listing.fieldEffectiveAt.description,
      ];
      expect(times.map((time) => time.getAttribute('datetime'))).toEqual(expected);
      for (const [index, time] of times.entries()) {
        expect(time).toBeVisible();
        expect(time).toHaveTextContent(formatComputedAt(expected[index]!, locale));
      }
      expect(disclosure.querySelectorAll('dt')).toHaveLength(8);
      expect(
        within(disclosure).getByText(locale === 'en' ? 'Property type' : 'Tipo de imóvel'),
      ).toBeVisible();
      await userEvent.click(summary);
      expect(disclosure).not.toHaveAttribute('open');
      await userEvent.click(summary);
      expect(times[1]).toBeVisible();
    },
  );

  it('escapes allowed text, compares permitted dated versions and keeps original hashes distinct', async () => {
    const response = listingFixture();
    mount(response);
    await screen.findByRole('heading', { name: response.listing.street });
    const section = within(screen.getByRole('region', { name: 'Descrição' }));
    expect(section.getAllByText('<script>safe visible text</script>')[0]).toBeVisible();
    expect(document.querySelector('.listing-details script')).toBeNull();
    await userEvent.click(section.getByText('Comparar versões permitidas'));
    expect(section.getByText('First allowed description')).toBeVisible();
    expect(section.getByText(/Versões corrigidas/)).toBeVisible();
    const event = response.listing.history.find((item) => item.type === 'description-changed')!;
    const details = screen
      .getByRole('heading', { name: 'Descrição alterada' })
      .closest('li')!
      .querySelector('details')!;
    await userEvent.click(within(details).getByText('Descrição'));
    expect(within(details).getByText(event.afterHash)).toBeVisible();
    expect(section.queryByText(event.afterHash)).not.toBeInTheDocument();
  });

  it.each(['pt-BR', 'en'] as const)(
    'shows denied change dates and source with no text/version control in %s',
    async (locale) => {
      const fixture = listingFixture();
      const response = parseListingResponse({
        ...fixture,
        listing: {
          ...fixture.listing,
          description: {
            permission: 'denied',
            changedAt: ['2026-06-01T12:00:00.000Z'],
            sourceUrl: fixture.listing.source.url,
          },
        },
      });
      mount(response, { locale });
      await screen.findByRole('heading', { name: response.listing.street });
      const description = within(
        screen.getByRole('region', { name: locale === 'en' ? 'Description' : 'Descrição' }),
      );
      expect(
        description.getByText(
          locale === 'en' ? /Description changed\. The source/ : /Descrição alterada\. A fonte/,
        ),
      ).toBeVisible();
      expect(
        description.getByText(formatComputedAt('2026-06-01T12:00:00.000Z', locale)),
      ).toBeVisible();
      expect(description.getByRole('link')).toHaveAttribute('href', response.listing.source.url);
      expect(document.querySelector('.listing-comparison')).toBeNull();
      expect(document.querySelector('.listing-description-text')).toBeNull();
      expect(document.body).not.toHaveTextContent('safe visible text');
      expect(document.body).not.toHaveTextContent('First allowed description');
    },
  );

  it.each(['expired', 'unavailable', 'available'] as const)(
    'preserves %s snapshot metadata, unknown retention/expiry and zero structured values',
    async (availability) => {
      const fixture = listingFixture();
      const response = parseListingResponse({
        ...fixture,
        listing: {
          ...fixture.listing,
          snapshot: { ...fixture.listing.snapshot, availability, expiresAt: null },
          status: 'removed',
          bedrooms: null,
          parkingSpaces: 0,
          features: [],
        },
      });
      mount(response);
      await screen.findByRole('heading', { name: response.listing.street });
      const values = within(screen.getByRole('region', { name: 'Valores neste anúncio' }));
      expect(
        within(values.getByRole('row', { name: /Quartos/ })).getByText('Não informado'),
      ).toBeVisible();
      expect(
        within(values.getByRole('row', { name: /Vagas de garagem/ })).getByText('0'),
      ).toBeVisible();
      expect(values.getByText(/Nada é inferido/)).toBeVisible();
      const snapshot = screen.getByRole('region', { name: 'Proveniência' });
      expect(snapshot).toHaveTextContent('Snapshots mantidosNão informado');
      expect(snapshot).toHaveTextContent('Expira emNão informado');
      expect(snapshot).toHaveTextContent('30 dias');
      expect(screen.getAllByText('Removido da fonte').length).toBeGreaterThan(0);
    },
  );

  it.each(['failure', 'mismatch'] as const)(
    'keeps Listing readable with neutral independently recoverable context: %s',
    async (branch) => {
      const fixture = propertyDetailFixture();
      const context = parsePropertyResponse({
        ...fixture,
        property: { ...fixture.property, listings: fixture.property.listings.slice(1) },
      });
      const { request } = mount(
        undefined,
        branch === 'failure' ? { contextStatus: 503 } : { context },
      );
      await screen.findByRole('alert');
      expect(screen.getByRole('heading', { name: 'Rua Cenário Um' })).toBeVisible();
      expect(screen.getByText(/quantidade de anúncios do imóvel não verificados/)).toBeVisible();
      expect(screen.queryByText('1 de 3')).not.toBeInTheDocument();
      expect(document.body).not.toHaveTextContent('private context exception');
      const nav = within(screen.getAllByRole('navigation', { name: 'Navegação principal' })[0]!);
      expect(nav.getByRole('link', { name: 'Buscar' })).toHaveAttribute('href', '/search');
      request.mockImplementation(
        async (input) =>
          new Response(
            JSON.stringify(
              input.startsWith('/api/v1/properties/') ? propertyDetailFixture() : listingFixture(),
            ),
          ),
      );
      await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
      await screen.findByText('1 de 3');
      expect(
        request.mock.calls.filter(([url]) => url.startsWith('/api/v1/listings/')),
      ).toHaveLength(1);
    },
  );

  it('shares one bounded context read across shell and screen and recovers it independently', async () => {
    vi.useFakeTimers();
    let stalled = true;
    const { request } = mount(undefined, {
      contextResponse: () =>
        stalled
          ? new Promise<Response>(() => {})
          : Promise.resolve(new Response(JSON.stringify(propertyDetailFixture()))),
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_001);
    });
    expect(screen.getByRole('alert')).toHaveTextContent('O contexto do imóvel não está disponível');
    expect(screen.getByRole('heading', { name: 'Rua Cenário Um' })).toBeVisible();
    expect(screen.getByText(/quantidade de anúncios do imóvel não verificados/)).toBeVisible();
    expect(screen.queryByText('1 de 3')).not.toBeInTheDocument();
    const nav = within(screen.getAllByRole('navigation', { name: 'Navegação principal' })[0]!);
    expect(nav.getByRole('link', { name: 'Buscar' })).toHaveAttribute('href', '/search');
    expect(
      request.mock.calls.filter(([url]) => url.startsWith('/api/v1/properties/')),
    ).toHaveLength(1);
    stalled = false;
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByText('1 de 3')).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(
      request.mock.calls.filter(([url]) => url.startsWith('/api/v1/properties/')),
    ).toHaveLength(2);
    expect(request.mock.calls.filter(([url]) => url.startsWith('/api/v1/listings/'))).toHaveLength(
      1,
    );
  });

  it.each(['bad-id', '0199a3e0-0000-4000-8000-000000000101'])(
    'suppresses invalid/v4 listing %s before HTTP',
    async (id) => {
      const { request } = mount(undefined, { path: `/listings/${id}` });
      expect(screen.getByRole('alert')).toHaveTextContent('Identificador de anúncio inválido');
      expect(request).not.toHaveBeenCalled();
    },
  );

  it.each([404, 503])(
    'sanitizes initial %s failure and manually recovers without auto retry',
    async (listingStatus) => {
      const { request } = mount(undefined, { listingStatus });
      await screen.findByRole('alert');
      expect(document.body).not.toHaveTextContent('private listing exception');
      expect(document.body).toHaveTextContent('0199a3e0-0000-7000-8000-000000000999');
      if (listingStatus === 404)
        expect(screen.getByRole('heading', { name: 'Anúncio não encontrado' })).toBeVisible();
      expect(request).toHaveBeenCalledTimes(1);
      request.mockImplementation(
        async (input) =>
          new Response(
            JSON.stringify(
              input.startsWith('/api/v1/listings/') ? listingFixture() : propertyDetailFixture(),
            ),
          ),
      );
      await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
      await screen.findByText('1 de 3');
    },
  );

  it('retains known Listing after failed refetch and recovers manually', async () => {
    const { request, cache } = mount();
    await screen.findByText('1 de 3');
    request.mockImplementation(async () => new Response('private stale payload', { status: 503 }));
    await act(async () => {
      await cache.refetchQueries({ queryKey: listingQuery(listingFixture().listing.id).queryKey });
    });
    await screen.findByRole('alert');
    expect(screen.getByRole('heading', { name: 'Rua Cenário Um' })).toBeVisible();
    expect(document.body).not.toHaveTextContent('private stale payload');
    request.mockImplementation(
      async (input) =>
        new Response(
          JSON.stringify(
            input.startsWith('/api/v1/listings/') ? listingFixture() : propertyDetailFixture(),
          ),
        ),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('retains exact safe Search return through explicit Property entry, Listing and browser history', async () => {
    const response = listingFixture(),
      applied = '/search/sao-paulo-bela-vista?sort=most-recent&priceReduced=false';
    mount(response, { path: propertyHref(response.listing.propertyId, applied) });
    await screen.findByRole('heading', { name: response.listing.street });
    await userEvent.click(screen.getByText('Aurora', { selector: 'summary strong' }));
    const entry = screen.getByRole('link', { name: 'Inspecionar anúncio na Aurora' });
    expect(entry).toHaveAttribute('href', listingHref(response.listing.id, applied));
    await userEvent.click(entry);
    await screen.findByText('1 de 3');
    expect(screen.getByRole('link', { name: 'Voltar ao imóvel' })).toHaveAttribute(
      'href',
      propertyHref(response.listing.propertyId, applied),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    await screen.findByRole('link', { name: 'Voltar à busca' });
    expect(screen.getByRole('link', { name: 'Voltar à busca' })).toHaveAttribute('href', applied);
    await userEvent.click(screen.getByRole('button', { name: 'Forward' }));
    await screen.findByText('1 de 3');
    await userEvent.click(screen.getByRole('link', { name: 'Voltar ao imóvel' }));
    expect(await screen.findByRole('link', { name: 'Voltar à busca' })).toHaveAttribute(
      'href',
      applied,
    );
  });

  it.each([
    '?returnTo=https%3A%2F%2Fevil.invalid',
    '?returnTo=%2Fsearch%2Fa%3Fview%3Dfilters',
    '?returnTo=%2Fsearch%2Fa&returnTo=%2Fsearch%2Fb',
  ])('rejects unsafe, editor or duplicate return parameters %s', async (suffix) => {
    const response = listingFixture();
    mount(response, { path: `/listings/${response.listing.id}${suffix}` });
    await screen.findByText('1 de 3');
    expect(screen.getByRole('link', { name: 'Voltar ao imóvel' })).toHaveAttribute(
      'href',
      `/properties/${response.listing.propertyId}`,
    );
  });
});

it('verifies associated Property identity, membership and position before sharing ancestry', () => {
  const listing = listingFixture().listing,
    property = propertyDetailFixture();
  expect(verifiedListingProperty(listing, property)).toBe(property);
  expect(verifiedListingProperty(undefined, property)).toBeUndefined();
  expect(verifiedListingProperty({ ...listing, position: 99 }, property)).toBeUndefined();
  expect(
    verifiedListingProperty(
      { ...listing, propertyId: '0199a3e0-0000-7000-8000-000000000777' },
      property,
    ),
  ).toBeUndefined();
});
