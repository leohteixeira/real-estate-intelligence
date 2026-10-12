// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, useNavigate, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../routes';
import { createLocale } from '../places/locale';
import { createReadCache, placesQuery } from '../places/place-queries';
import {
  bela,
  marketFixture,
  metadata,
  pinheiros,
  placesFixture,
} from '../places/place-fixtures.test';

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
function History() {
  const navigate = useNavigate();
  return (
    <>
      <output aria-label="Current URL">{useLocation().pathname}</output>
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
function mount(path: string) {
  const request = vi.fn(
    async (input: string) =>
      new Response(
        JSON.stringify(
          placesFixture(input) ??
            (input.endsWith('/market') ? marketFixture() : { metadata, place: bela }),
        ),
      ),
  );
  vi.stubGlobal('fetch', request);
  const cache = createReadCache();
  caches.push(cache);
  render(
    <I18nextProvider i18n={createLocale('pt-BR')}>
      <QueryClientProvider client={cache}>
        <MemoryRouter initialEntries={[path]}>
          <History />
          <AppRoutes />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
  return request;
}
describe('public shell', () => {
  it('retains catalogue links on a failed refresh and recovers only through manual retry', async () => {
    const request = mount(`/places/${bela.id}?filters=retained`);
    await screen.findByText('R$ 9.515');
    request.mockImplementation(async (input: string) =>
      input === '/api/v1/places'
        ? new Response('private catalogue body', { status: 503 })
        : new Response(
            JSON.stringify(input.endsWith('/market') ? marketFixture() : { metadata, place: bela }),
          ),
    );
    await act(async () => {
      await caches.at(-1)!.refetchQueries({ queryKey: placesQuery().queryKey });
    });
    const navigation = within(screen.getByRole('navigation', { name: 'Navegação de lugares' }));
    expect(navigation.getByRole('link', { name: 'Bela Vista' })).toBeVisible();
    expect(navigation.getByRole('link', { name: 'Pinheiros' })).toBeVisible();
    expect(await navigation.findByRole('alert')).not.toHaveTextContent('private catalogue body');
    const attempts = request.mock.calls.filter(([url]) => url === '/api/v1/places').length;
    expect(attempts).toBe(2);
    request.mockImplementation(
      async (input: string) =>
        new Response(
          JSON.stringify(
            placesFixture(input) ??
              (input.endsWith('/market') ? marketFixture() : { metadata, place: bela }),
          ),
        ),
    );
    await userEvent.click(navigation.getByRole('button', { name: 'Tentar de novo' }));
    await screen.findByText('R$ 9.515');
    expect(request.mock.calls.filter(([url]) => url === '/api/v1/places')).toHaveLength(3);
    await waitFor(() => expect(navigation.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Bela Vista' })).toBeVisible();
  });
  it('links three destinations with retained place, current state and browser history', async () => {
    const request = mount(`/places/${bela.id}`);
    await screen.findByText('R$ 9.515');
    const nav = within(screen.getAllByRole('navigation', { name: 'Navegação principal' })[0]!);
    expect(nav.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      `/places/${bela.id}`,
      `/search/${bela.id}`,
      `/ask/${bela.id}`,
    ]);
    await userEvent.click(nav.getByRole('link', { name: 'Buscar' }));
    expect(await screen.findByRole('heading', { name: 'Buscar' })).toBeVisible();
    expect(nav.getByRole('link', { name: 'Buscar' })).toHaveAttribute('aria-current', 'page');
    await userEvent.click(nav.getByRole('link', { name: 'Perguntar' }));
    expect(await screen.findByRole('heading', { name: 'Perguntar' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    await screen.findByRole('heading', { name: 'Buscar' });
    await userEvent.click(screen.getByRole('button', { name: 'Forward' }));
    await screen.findByRole('heading', { name: 'Perguntar' });
    await userEvent.click(screen.getByRole('link', { name: 'Ver a mediana do lugar' }));
    await screen.findByText('R$ 9.515');
    expect(request.mock.calls.filter(([url]) => url === `/api/v1/places/${bela.id}`)).toHaveLength(
      1,
    );
    expect(
      screen.queryByRole('link', { name: /Market|Mercado|Operations|Privacy|More|Alerts/ }),
    ).not.toBeInTheDocument();
  });
  it.each(['places', 'search', 'ask'])('defaults /%s to Bela Vista', async (destination) => {
    mount(`/${destination}`);
    expect(await screen.findByRole('heading', { name: 'Bela Vista' })).toBeVisible();
    expect(screen.getByRole('status', { name: 'Current URL' })).toHaveTextContent(
      `/${destination}/${bela.id}`,
    );
  });
  it.each([
    ['places', 'Lugares'],
    ['search', 'Buscar'],
    ['ask', 'Perguntar'],
  ])(
    'keeps both navigation variants current on /%s trailing-slash deep links',
    async (destination, label) => {
      mount(`/${destination}/${bela.id}/`);
      await screen.findByRole('heading', { name: 'Bela Vista' });
      const publicNavigations = screen.getAllByRole('navigation', { name: 'Navegação principal' });
      expect(publicNavigations).toHaveLength(2);
      for (const navigation of publicNavigations) {
        expect(navigation.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
        expect(within(navigation).getByRole('link', { name: label })).toHaveAttribute(
          'aria-current',
          'page',
        );
      }
      const neighborhoodNavigation = screen.getByRole('navigation', {
        name: 'Navegação de lugares',
      });
      expect(neighborhoodNavigation.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
      expect(
        within(neighborhoodNavigation).getByRole('link', { name: 'Bela Vista' }),
      ).toHaveAttribute('aria-current', 'page');
    },
  );
  it.each([
    ['Search', 'search', 'Buscar'],
    ['Ask', 'ask', 'Perguntar'],
  ])(
    'keeps /%s destination title, current state and canonical neighborhood targets',
    async (accepted, destination, label) => {
      const request = mount(`/${accepted}/${bela.id}`);
      await screen.findByRole('heading', { name: label });
      expect(document.title).toBe(`${label} · Real Estate Intelligence`);
      for (const navigation of screen.getAllByRole('navigation', { name: 'Navegação principal' })) {
        expect(navigation.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
        expect(within(navigation).getByRole('link', { name: label })).toHaveAttribute(
          'aria-current',
          'page',
        );
      }
      const neighborhoodNavigation = within(
        screen.getByRole('navigation', { name: 'Navegação de lugares' }),
      );
      expect(
        neighborhoodNavigation.getAllByRole('link').map((link) => link.getAttribute('href')),
      ).toEqual([`/${destination}/${bela.id}`, `/${destination}/${pinheiros.id}`]);
      expect(neighborhoodNavigation.getByRole('link', { name: 'Bela Vista' })).toHaveAttribute(
        'aria-current',
        'page',
      );
      expect(request).toHaveBeenCalledWith(`/api/v1/places/${bela.id}`, expect.any(Object));
    },
  );
  it('switches every entry namespace and document title without another read or URL change', async () => {
    const request = mount(`/ask/${bela.id}`);
    await screen.findByRole('heading', { name: 'Perguntar' });
    const reads = request.mock.calls.length;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Denied');
    });
    await userEvent.click(
      within(screen.getAllByRole('group', { name: 'Idioma' })[0]!).getByRole('button', {
        name: 'English',
      }),
    );
    expect(await screen.findByRole('heading', { name: 'Ask' })).toBeVisible();
    expect(document.documentElement.lang).toBe('en');
    expect(document.title).toBe('Ask · Real Estate Intelligence');
    expect(screen.getByRole('status', { name: 'Current URL' })).toHaveTextContent(
      `/ask/${bela.id}`,
    );
    expect(request).toHaveBeenCalledTimes(reads);
    expect(screen.getAllByText('Synthetic data').length).toBeGreaterThan(1);
  });
});
