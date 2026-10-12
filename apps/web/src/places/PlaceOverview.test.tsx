// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../routes';
import { createLocale } from './locale';
import type { Locale } from './locale';
import { createReadCache } from './place-queries';
import { bela, marketFixture, metadata, pinheiros, placesFixture } from './place-fixtures.test';

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
  vi.restoreAllMocks();
  localStorage.clear();
});

function mount(path = `/places/${bela.id}`, locale: Locale = 'pt-BR') {
  const cache = createReadCache();
  caches.push(cache);
  const i18n = createLocale(locale);
  const view = render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={cache}>
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
  return { ...view, cache };
}
function mockReads() {
  const request = vi.fn(async (input: string) => {
    const collection = placesFixture(input);
    if (collection) return new Response(JSON.stringify(collection));
    const place = input.includes(pinheiros.id) ? pinheiros : bela;
    return new Response(
      JSON.stringify(
        input.endsWith('/market')
          ? marketFixture(place, place.id === bela.id)
          : { metadata, place },
      ),
    );
  });
  vi.stubGlobal('fetch', request);
  return request;
}

describe('place tracer', () => {
  it('renders self-inclusive contract breadcrumbs once and preserves Placa control/value composition', async () => {
    const request = mockReads();
    const base = request.getMockImplementation()!;
    request.mockImplementation(async (input: string) =>
      input === `/api/v1/places/${bela.id}`
        ? new Response(
            JSON.stringify({
              metadata,
              place: {
                ...bela,
                breadcrumbs: [
                  ...bela.breadcrumbs,
                  { id: bela.id, kind: bela.kind, name: bela.name },
                ],
              },
            }),
          )
        : base(input),
    );
    const view = mount();
    await screen.findByText('R$ 9.515');
    const hierarchy = within(screen.getByRole('navigation', { name: 'Hierarquia do lugar' }));
    expect(hierarchy.getAllByText('Bela Vista')).toHaveLength(1);
    expect(hierarchy.queryByRole('link', { name: 'Bela Vista' })).not.toBeInTheDocument();
    expect(view.container.querySelector('.fig__value')).toHaveTextContent('R$ 9.515 /m²');
    const languages = within(screen.getAllByRole('group', { name: 'Idioma' })[0]!);
    expect(languages.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'EN',
      'PT',
    ]);
  });
  it('shows the plate and only live asking evidence in Portuguese, then switches to English', async () => {
    mockReads();
    mount();
    expect(await screen.findByRole('heading', { name: 'Bela Vista' })).toBeVisible();
    expect(await screen.findByText('R$ 9.515')).toBeVisible();
    expect(screen.getByText('1 imóvel contribuinte')).toBeVisible();
    expect(screen.getByText('Fontes: synthetic-data')).toBeVisible();
    expect(screen.getByText(/Calculada em/)).toHaveTextContent('12:00 UTC');
    expect(screen.getByText('Pedido')).toBeVisible();
    expect(screen.queryByText('2000')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Centro' })).toBeVisible();
    await userEvent.click(
      within(screen.getAllByRole('group', { name: 'Idioma' })[0]!).getByRole('button', {
        name: 'English',
      }),
    );
    expect(await screen.findByText('R$ 9,515')).toBeVisible();
    expect(screen.getByText('1 contributing property')).toBeVisible();
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem('rei.locale')).toBe('en');
    expect(screen.getByRole('heading', { name: 'Bela Vista' })).toBeVisible();
  });
  it('navigates to empty Pinheiros without retaining the previous median', async () => {
    mockReads();
    mount('/places');
    await screen.findByText('R$ 9.515');
    await userEvent.click(screen.getByRole('link', { name: 'Pinheiros' }));
    expect(await screen.findByRole('heading', { name: 'Pinheiros' })).toBeVisible();
    expect(await screen.findByText('Mediana não disponível')).toBeVisible();
    expect(screen.queryByText('R$ 9.515')).not.toBeInTheDocument();
  });
  it('retains the plate while pending and aborts superseded median reads', async () => {
    const request = mockReads();
    let pendingSignal: AbortSignal | undefined;
    request.mockImplementation(async (input: string, ...rest: unknown[]) => {
      if (input.endsWith(`${bela.id}/market`)) {
        const options = rest[0] as RequestInit;
        pendingSignal = options.signal ?? undefined;
        return new Promise<Response>((_resolve, reject) =>
          options.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          ),
        );
      }
      const place = input.includes(pinheiros.id) ? pinheiros : bela;
      return new Response(
        JSON.stringify(
          placesFixture(input)
            ? placesFixture(input)
            : input.endsWith('/market')
              ? marketFixture(place, false)
              : { metadata, place },
        ),
      );
    });
    mount();
    expect(await screen.findByRole('heading', { name: 'Bela Vista' })).toBeVisible();
    expect(await screen.findByText('Carregando mediana…')).toBeVisible();
    await userEvent.click(screen.getByRole('link', { name: 'Pinheiros' }));
    await screen.findByText('Mediana não disponível');
    expect(pendingSignal?.aborted).toBe(true);
  });
  it.each(['http', 'malformed'])(
    'keeps the place when the median %s read fails and retries manually',
    async (failure) => {
      const request = mockReads();
      const base = request.getMockImplementation()!;
      let failing = true;
      request.mockImplementation(async (input: string) =>
        input.endsWith('/market') && failing
          ? new Response(failure === 'http' ? 'private payload' : '{}', {
              status: failure === 'http' ? 503 : 200,
            })
          : base(input),
      );
      mount();
      expect(
        await screen.findByText('Não foi possível carregar a mediana. Tente novamente.'),
      ).toBeVisible();
      expect(screen.getByRole('heading', { name: 'Bela Vista' })).toBeVisible();
      expect(screen.queryByText('private payload')).not.toBeInTheDocument();
      failing = false;
      await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
      expect(await screen.findByText('R$ 9.515')).toBeVisible();
    },
  );
  it.each(['http', 'malformed'])(
    'retains the validated same-place plate after a cached %s refresh failure and recovers',
    async (failure) => {
      const request = mockReads();
      const base = request.getMockImplementation()!;
      let failing = false;
      request.mockImplementation(async (input: string) =>
        input === `/api/v1/places/${bela.id}` && failing
          ? new Response(failure === 'http' ? 'private payload' : '{}', {
              status: failure === 'http' ? 503 : 200,
            })
          : base(input),
      );
      const { cache } = mount();
      await screen.findByText('R$ 9.515');
      failing = true;
      await act(async () => {
        await cache.refetchQueries({ queryKey: ['place', bela.id], exact: true });
      });
      expect(
        await screen.findByText('Não foi possível carregar o lugar. Tente novamente.'),
      ).toBeVisible();
      expect(screen.getByRole('heading', { name: 'Bela Vista' })).toBeVisible();
      expect(screen.getByRole('link', { name: 'Centro' })).toBeVisible();
      expect(screen.queryByText('private payload')).not.toBeInTheDocument();
      expect(screen.getByText('R$ 9.515')).toBeVisible();
      failing = false;
      await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
      expect(await screen.findByText('R$ 9.515')).toBeVisible();
      expect(screen.getByRole('heading', { name: 'Bela Vista' })).toBeVisible();
      expect(
        screen.queryByText('Não foi possível carregar o lugar. Tente novamente.'),
      ).not.toBeInTheDocument();
      expect(
        request.mock.calls.filter(([input]) => input === `/api/v1/places/${bela.id}`),
      ).toHaveLength(3);
    },
  );
  it('makes no place request for an invalid ID and handles a missing registered place', async () => {
    const request = mockReads();
    const view = mount('/places/BAD_ID', 'en');
    expect(screen.getByText('Invalid place identifier.')).toBeVisible();
    expect(request).not.toHaveBeenCalled();
    expect(request.mock.calls.some(([input]) => input.includes('BAD_ID'))).toBe(false);
    view.unmount();
    request.mockImplementation(async (input: string) =>
      placesFixture(input)
        ? new Response(JSON.stringify(placesFixture(input)))
        : new Response('private payload', { status: 404 }),
    );
    mount('/places/missing-place', 'en');
    expect(await screen.findByText('Place not found.')).toBeVisible();
  });
  it('shows localized place/list failures and allows recovery', async () => {
    const request = vi.fn().mockResolvedValue(new Response('{}', { status: 503 }));
    vi.stubGlobal('fetch', request);
    mount();
    expect(
      await screen.findByText('Não foi possível carregar o lugar. Tente novamente.'),
    ).toBeVisible();
    expect(await screen.findByText('Não foi possível carregar a lista de lugares.')).toBeVisible();
    mockReads();
    for (const button of screen.getAllByRole('button', { name: 'Tentar de novo' }))
      await userEvent.click(button);
    expect(await screen.findByText('R$ 9.515')).toBeVisible();
  });
  it('retains the exact median and selected query context after a failed background refresh', async () => {
    const request = mockReads();
    const base = request.getMockImplementation()!;
    let failing = false;
    request.mockImplementation(async (input: string) =>
      input.endsWith('/market') && failing
        ? new Response('secret payload', {
            status: 503,
            headers: { 'x-request-id': 'd392f952-20fa-49b4-8cf6-4da26c8d7abc' },
          })
        : base(input),
    );
    const { cache } = mount(`/places/${bela.id}?owned-filter=retained`);
    await screen.findByText('R$ 9.515');
    failing = true;
    await act(async () => {
      await cache.refetchQueries({ queryKey: ['place', bela.id, 'market'], exact: true });
    });
    expect(
      await screen.findByText('Não foi possível carregar a mediana. Tente novamente.'),
    ).toBeVisible();
    expect(screen.getByText('R$ 9.515')).toBeVisible();
    expect(screen.getByText('1 imóvel contribuinte')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Bela Vista' })).toBeVisible();
    expect(document.body).not.toHaveTextContent('secret payload');
    failing = false;
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByText('R$ 9.515')).toBeVisible();
  });
  it('renders a genuinely known catalogue plate before its delayed detail without adding a cache', async () => {
    const request = mockReads();
    const base = request.getMockImplementation()!;
    let resolveDetail: ((value: Response) => void) | undefined;
    request.mockImplementation(async (input: string) =>
      input === `/api/v1/places/${bela.id}`
        ? new Promise<Response>((resolve) => {
            resolveDetail = resolve;
          })
        : base(input),
    );
    mount();
    expect(await screen.findByRole('heading', { name: 'Bela Vista' })).toBeVisible();
    expect(screen.getByText('Carregando lugar…')).toBeVisible();
    await act(async () => {
      resolveDetail?.(new Response(JSON.stringify({ metadata, place: bela })));
    });
    expect(await screen.findByText('R$ 9.515')).toBeVisible();
  });
  it('keeps long canonical names and reports untracked evidence', async () => {
    const request = mockReads();
    const base = request.getMockImplementation()!;
    const name = 'Bairro com nome muito longo que deve continuar completo';
    request.mockImplementation(async (input: string) => {
      if (input === `/api/v1/places/${bela.id}`)
        return new Response(
          JSON.stringify({
            metadata,
            place: { ...bela, name: { en: 'Wrong translation', ptBR: name } },
          }),
        );
      if (input.endsWith('/market')) {
        const market = marketFixture();
        return new Response(
          JSON.stringify({
            ...market,
            figures: {
              ...market.figures,
              medianAskingPricePerSquareMeter: {
                ...market.figures.medianAskingPricePerSquareMeter,
                freshness: {
                  status: 'untracked',
                  latestCollectionCompletedAt: null,
                  ageSeconds: 0,
                },
              },
            },
          }),
        );
      }
      return base(input);
    });
    mount(undefined, 'en');
    expect(await screen.findByRole('heading', { name })).toBeVisible();
    expect(await screen.findByText('Freshness not tracked')).toBeVisible();
  });
  it('switches language even when preference storage throws', async () => {
    mockReads();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Denied');
    });
    mount();
    await screen.findByText('R$ 9.515');
    await userEvent.click(screen.getAllByRole('button', { name: 'English' })[0]!);
    expect(await screen.findByText('R$ 9,515')).toBeVisible();
  });
});
