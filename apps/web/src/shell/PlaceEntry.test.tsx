// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../routes';
import { createLocale } from '../places/locale';
import { createReadCache } from '../places/place-queries';
import { bela, pinheiros, metadata, placesFixture } from '../places/place-fixtures.test';

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
function mount(path: string) {
  const cache = createReadCache();
  caches.push(cache);
  render(
    <I18nextProvider i18n={createLocale('pt-BR')}>
      <QueryClientProvider client={cache}>
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
  return cache;
}
function reads() {
  const request = vi.fn(
    async (input: string) =>
      new Response(
        JSON.stringify(
          placesFixture(input) ?? {
            metadata,
            place: input.includes(pinheiros.id) ? pinheiros : bela,
          },
        ),
      ),
  );
  vi.stubGlobal('fetch', request);
  return request;
}
describe('geographic public entries', () => {
  it.each(['search', 'ask'] as const)(
    'opens %s with real identity and the current web boundary only',
    async (destination) => {
      const request = reads();
      mount(`/${destination}/${bela.id}`);
      expect(await screen.findByRole('heading', { name: 'Bela Vista' })).toBeVisible();
      expect(
        screen.getByText(
          destination === 'search'
            ? 'A tela de resultados e filtros ainda não está disponível nesta versão.'
            : 'A tela de execuções ainda não está disponível nesta versão.',
        ),
      ).toBeVisible();
      expect(screen.getByRole('link', { name: 'Ver a mediana do lugar' })).toHaveAttribute(
        'href',
        `/places/${bela.id}`,
      );
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      expect(
        request.mock.calls.some(([url]) => url.endsWith('/market') || url.includes('/ask')),
      ).toBe(false);
      expect(
        within(screen.getByRole('navigation', { name: 'Hierarquia do lugar' })).getByRole('link', {
          name: 'Centro',
        }),
      ).toHaveAttribute('href', `/${destination}/sao-paulo-centro`);
    },
  );
  it.each(['search', 'ask'] as const)(
    'rejects invalid %s identities before the detail request',
    async (destination) => {
      const request = reads();
      mount(`/${destination}/BAD_ID`);
      expect(screen.getByText('Identificador de lugar inválido.')).toBeVisible();
      expect(request.mock.calls.some(([url]) => url.includes('BAD_ID'))).toBe(false);
      expect(screen.queryByRole('heading', { name: 'Bela Vista' })).not.toBeInTheDocument();
    },
  );
  it.each(['missing', 'malformed', 'failed'] as const)(
    'localizes %s reads and recovers through explicit retry',
    async (failure) => {
      const request = reads();
      const base = request.getMockImplementation()!;
      let failing = true;
      request.mockImplementation(async (input: string) =>
        input === `/api/v1/places/${bela.id}` && failing
          ? new Response(failure === 'malformed' ? '{}' : 'private body', {
              status: failure === 'missing' ? 404 : failure === 'failed' ? 503 : 200,
            })
          : base(input),
      );
      mount(`/ask/${bela.id}`);
      expect(
        await screen.findByText(
          failure === 'missing'
            ? 'Lugar não encontrado.'
            : 'Não foi possível carregar o lugar. Tente novamente.',
        ),
      ).toBeVisible();
      expect(screen.queryByRole('heading', { name: 'Bela Vista' })).not.toBeInTheDocument();
      expect(screen.queryByText('private body')).not.toBeInTheDocument();
      expect(
        screen.queryByText('A tela de execuções ainda não está disponível nesta versão.'),
      ).not.toBeInTheDocument();
      failing = false;
      await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
      expect(await screen.findByRole('heading', { name: 'Bela Vista' })).toBeVisible();
    },
  );
  it('retains validated cached geography during a failed refresh, then recovers', async () => {
    const request = reads();
    const base = request.getMockImplementation()!;
    let failing = false;
    request.mockImplementation(async (input: string) =>
      input === `/api/v1/places/${bela.id}` && failing ? new Response('{}') : base(input),
    );
    const cache = mount(`/search/${bela.id}`);
    await screen.findByRole('heading', { name: 'Bela Vista' });
    failing = true;
    await act(async () => {
      await cache.refetchQueries({ queryKey: ['place', bela.id], exact: true });
    });
    expect(
      await screen.findByText('Não foi possível carregar o lugar. Tente novamente.'),
    ).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Bela Vista' })).toBeVisible();
    failing = false;
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByRole('heading', { name: 'Buscar' })).toBeVisible();
  });
  it('cancels delayed superseded reads and never shows the prior-place plate', async () => {
    const request = reads();
    const base = request.getMockImplementation()!;
    let pending: AbortSignal | null | undefined;
    request.mockImplementation(async (input: string, ...rest: unknown[]) => {
      if (input === `/api/v1/places/${bela.id}`) {
        const options = rest[0] as RequestInit;
        pending = options.signal;
        return new Promise<Response>((_resolve, reject) =>
          options.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          ),
        );
      }
      return base(input);
    });
    mount(`/ask/${bela.id}`);
    expect(screen.getByText('Carregando lugar…')).toBeVisible();
    await userEvent.click(await screen.findByRole('link', { name: 'Pinheiros' }));
    expect(await screen.findByRole('heading', { name: 'Pinheiros' })).toBeVisible();
    expect(pending?.aborted).toBe(true);
    expect(screen.queryByRole('heading', { name: 'Bela Vista' })).not.toBeInTheDocument();
  });
});
