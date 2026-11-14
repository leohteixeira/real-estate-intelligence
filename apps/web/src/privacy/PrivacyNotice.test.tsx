// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SYNTHETIC_ENABLED_SOURCE } from '@rei/contracts';
import { AppRoutes } from '../routes';
import { config } from '../config';
import { createLocale } from '../places/locale';
import { createReadCache } from '../places/place-queries';
import { privacySourcesQuery } from './privacy-client';

const caches: ReturnType<typeof createReadCache>[] = [];
const originalPublicIdentity = {
  privacyControllerName: config.privacyControllerName,
  privacyContactEmail: config.privacyContactEmail,
};
afterEach(async () => {
  Object.assign(config, originalPublicIdentity);
  cleanup();
  for (const cache of caches.splice(0)) {
    await cache.cancelQueries();
    cache.clear();
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});
function mount(
  locale: 'en' | 'pt-BR' = 'en',
  read = async () => new Response(JSON.stringify({ sources: [SYNTHETIC_ENABLED_SOURCE] })),
) {
  const cache = createReadCache();
  caches.push(cache);
  const request = vi.fn(read);
  vi.stubGlobal('fetch', request);
  const view = render(
    <I18nextProvider i18n={createLocale(locale)}>
      <QueryClientProvider client={cache}>
        <MemoryRouter initialEntries={['/privacy']}>
          <AppRoutes />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
  return { ...view, cache, request };
}
describe('public privacy document', () => {
  it('keeps all static policy readable while loading and after an initial failure', async () => {
    const held: { reject?: (reason: Error) => void } = {};
    const { request } = mount(
      'en',
      () =>
        new Promise<Response>((_resolve, reject) => {
          held.reject = reject;
        }),
    );
    expect(screen.getByRole('status')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Your rights' })).toBeVisible();
    await act(async () => {
      held.reject?.(new Error('private transport body'));
    });
    expect(await screen.findByRole('alert')).not.toHaveTextContent('private transport body');
    expect(screen.getByRole('main').querySelectorAll('h2')).toHaveLength(9);
    expect(screen.queryByText(SYNTHETIC_ENABLED_SOURCE.displayLabel)).toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
  });
  it.each(['en', 'pt-BR'] as const)(
    'renders every section in %s, actual sources, native contents and no geographic reads',
    async (locale) => {
      const { request, container } = mount(locale);
      expect(
        await screen.findByRole('heading', {
          name:
            locale === 'en'
              ? SYNTHETIC_ENABLED_SOURCE.displayLabel
              : 'Amostra sintética identificada',
        }),
      ).toBeVisible();
      const main = screen.getByRole('main');
      const source = main.querySelector<HTMLElement>('.privacy-source')!;
      expect(source).toHaveTextContent(
        locale === 'en'
          ? 'Licence not applicable: Synthetic data'
          : 'Licença não aplicável: dados sintéticos',
      );
      if (locale === 'pt-BR') {
        expect(source).not.toHaveTextContent(SYNTHETIC_ENABLED_SOURCE.displayLabel);
        expect(source).not.toHaveTextContent('Synthetic data');
      }
      expect(within(main).getAllByRole('heading', { level: 2 })).toHaveLength(9);
      const contents = within(
        screen.getByRole('navigation', {
          name: locale === 'en' ? 'In this notice' : 'Neste aviso',
        }),
      );
      expect(contents.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
        '#fields',
        '#sources',
        '#purpose',
        '#basis',
        '#retention',
        '#sharing',
        '#rights',
        '#removal',
        '#controller',
      ]);
      expect(container.querySelector('.plate,.crumbs,.place-navigation')).toBeNull();
      expect(container.querySelector('[aria-current="page"]')).toBeNull();
      expect(document.documentElement.lang).toBe(locale);
      expect(document.title).toBe(
        `${locale === 'en' ? 'Privacy' : 'Privacidade'} · Real Estate Intelligence`,
      );
      expect(request.mock.calls).toHaveLength(1);
      expect(request).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/v1\/collection\/sources$/),
        expect.any(Object),
      );
      expect(container.querySelector('a[href^="mailto:"]')).toBeNull();
      expect(main).toHaveTextContent(
        locale === 'en'
          ? 'No valid public privacy email is configured'
          : 'Não há e-mail público de privacidade configurado',
      );
      expect(
        screen.getAllByRole('link', {
          name: locale === 'en' ? 'Privacy' : 'Privacidade',
        }),
      ).toHaveLength(2);
    },
  );
  it('retains evidence after a failed refresh, never exposes raw payload and recovers by manual retry', async () => {
    const { request, cache } = mount();
    await screen.findByText(SYNTHETIC_ENABLED_SOURCE.displayLabel);
    request.mockImplementation(async () => new Response('private refusal', { status: 503 }));
    await act(async () => {
      await cache.refetchQueries({ queryKey: privacySourcesQuery().queryKey });
    });
    expect(await screen.findByRole('alert')).not.toHaveTextContent('private refusal');
    expect(screen.getByText(SYNTHETIC_ENABLED_SOURCE.displayLabel)).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('last valid source list');
    expect(screen.getByRole('heading', { name: 'Your rights' })).toBeVisible();
    expect(request).toHaveBeenCalledTimes(2);
    request.mockImplementation(async () => new Response('{"sources":[]}'));
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No source is enabled in this response.')).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(SYNTHETIC_ENABLED_SOURCE.displayLabel)).not.toBeInTheDocument();
    expect(request).toHaveBeenCalledTimes(3);
  });
  it('localizes the complete document and footer without refetching and saves the shared locale', async () => {
    const { request } = mount();
    await screen.findByText(SYNTHETIC_ENABLED_SOURCE.displayLabel);
    await userEvent.click(screen.getAllByRole('button', { name: 'Português' })[0]!);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Privacidade');
    expect(screen.getByRole('heading', { name: 'Retenção e descarte' })).toBeVisible();
    expect(document.documentElement.lang).toBe('pt-BR');
    expect(localStorage.getItem('rei.locale')).toBe('pt-BR');
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('shows configured public synthetic identity and a mailto while retaining the real-processing gate', async () => {
    Object.assign(config, {
      privacyControllerName: 'Synthetic Privacy Controller',
      privacyContactEmail: 'privacy@example.test',
    });
    mount();
    expect(await screen.findByText('Synthetic Privacy Controller')).toBeVisible();
    expect(screen.getByRole('link', { name: 'privacy@example.test' })).toHaveAttribute(
      'href',
      'mailto:privacy@example.test',
    );
    expect(screen.getByRole('main')).toHaveTextContent('Real processing remains disabled');
  });
  it('renders every admitted licence discriminator and exact independent permissions', async () => {
    const { cache } = mount();
    await screen.findByText(SYNTHETIC_ENABLED_SOURCE.displayLabel);
    act(() => {
      cache.setQueryData(privacySourcesQuery().queryKey, {
        sources: [
          SYNTHETIC_ENABLED_SOURCE,
          {
            ...SYNTHETIC_ENABLED_SOURCE,
            sourceId: 'synthetic-licensed',
            displayLabel: 'Synthetic licensed branch',
            permissions: {
              collectionAllowed: true,
              imageFetchingAllowed: false,
              listingTextDisplayAllowed: false,
            },
            licence: {
              status: 'licensed',
              label: 'Exact synthetic licence',
              url: 'https://example.test/licence',
            },
          },
          {
            ...SYNTHETIC_ENABLED_SOURCE,
            sourceId: 'synthetic-unverified',
            displayLabel: 'Synthetic unverified branch',
            licence: { status: 'not-verified', label: null, url: null },
          },
        ],
      });
    });
    expect(await screen.findByRole('link', { name: 'Exact synthetic licence' })).toHaveAttribute(
      'href',
      'https://example.test/licence',
    );
    const licensed = screen.getByText('Synthetic licensed branch').closest('li')!;
    expect(within(licensed).getAllByText('not allowed')).toHaveLength(2);
    const unverified = screen.getByText('Synthetic unverified branch').closest('li')!;
    expect(within(unverified).queryByRole('link')).toBeNull();
    expect(unverified).toHaveTextContent('not verified');
  });
  it('names the synthetic portals in Portuguese and keeps the API attribution of any other source', async () => {
    const portal = (name: string) => ({
      ...SYNTHETIC_ENABLED_SOURCE,
      sourceId: `synthetic-portal-${name.toLowerCase()}`,
      displayLabel: `Synthetic data — ${name}`,
    });
    mount(
      'pt-BR',
      async () =>
        new Response(
          JSON.stringify({
            sources: [
              portal('Aurora'),
              portal('Brisa'),
              portal('Cobalto'),
              {
                ...SYNTHETIC_ENABLED_SOURCE,
                sourceId: 'unlisted-source',
                displayLabel: 'Unlisted attribution',
                licence: { status: 'not-applicable', label: 'Published reason', url: null },
              },
            ],
          }),
        ),
    );
    await screen.findByRole('heading', { name: 'Dados sintéticos — Aurora' });
    expect(
      [...document.querySelectorAll('.privacy-source h3')].map((name) => name.textContent),
    ).toEqual([
      'Dados sintéticos — Aurora',
      'Dados sintéticos — Brisa',
      'Dados sintéticos — Cobalto',
      'Unlisted attribution',
    ]);
    expect(screen.getByRole('main')).not.toHaveTextContent('Synthetic data');
    expect(screen.getByText('Unlisted attribution').closest('li')).toHaveTextContent(
      'Licença não aplicável: Published reason',
    );
  });
});
