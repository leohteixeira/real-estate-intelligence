// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../routes';
import { createLocale } from '../places/locale';
import { createReadCache } from '../places/place-queries';
import { overviewFixture } from '../places/overview-fixtures.test';
import {
  completed,
  metadata,
  prior,
  queued,
  runId,
  threadId,
  wire,
  reorderMembers,
} from './ask-fixtures.test';

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
const base = { basis: 'prepared-ask-example', metadata } as const;
function mount(
  options: {
    draft?: unknown;
    path?: string;
    fail?: boolean;
    interrupted?: boolean;
    reordered?: boolean;
  } = {},
) {
  const request = vi.fn(async (input: string, _init?: RequestInit) => {
    void _init;
    if (input.includes('/ask/')) {
      if (options.fail) return new Response('private authority', { status: 403 });
      if (input.endsWith('capabilities'))
        return new Response(
          JSON.stringify({
            ...base,
            mode: 'prepared-fixtures',
            commandHandlers: false,
            intents: [
              { intent: 'price_per_square_meter', available: true },
              { intent: 'unavailable', available: false },
            ],
          }),
        );
      return new Response(
        JSON.stringify({
          ...base,
          items: [
            'queued',
            'running',
            'awaiting_confirmation',
            'completed',
            'failed',
            'cancelled',
            'expired',
          ].map((state, index) => ({
            runId: runId.slice(0, -1) + String(index + 1),
            threadId: threadId.slice(0, -1) + String(index + 1),
            state,
            grant: { scope: 'synthetic-fixture', capability: `prepared-capability-${state}` },
          })),
        }),
      );
    }
    if (input.endsWith('/events'))
      return new Response(options.interrupted ? wire(0) : wire(0) + wire(1) + wire(2), {
        headers: { 'content-type': 'text/event-stream' },
      });
    if (input.includes('/threads/'))
      return new Response(
        JSON.stringify({
          ...base,
          id: threadId,
          principalId: null,
          runs: [prior, options.reordered ? reorderMembers(queued) : queued],
        }),
      );
    if (input.includes('/runs/')) return new Response(JSON.stringify(queued));
    return new Response(JSON.stringify(overviewFixture(input)));
  });
  vi.stubGlobal('fetch', request);
  const cache = createReadCache();
  caches.push(cache);
  const locale = createLocale('en');
  const view = render(
    <I18nextProvider i18n={locale}>
      <QueryClientProvider client={cache}>
        <MemoryRouter
          initialEntries={[
            { pathname: options.path ?? '/ask/sao-paulo-bela-vista', state: options.draft },
          ]}
        >
          <AppRoutes />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
  return { request, cache, locale, view, options };
}
describe('Ask screen', () => {
  it('follows when separately serialized GET and thread snapshots reorder nested members', async () => {
    mount({ reordered: true });
    await userEvent.click(
      await screen.findByRole('button', { name: 'Follow the prepared example' }),
    );
    await screen.findByText('R$ 10,000.00', { exact: false });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('keeps editable escaped unsent draft separate from explicit example following and locale changes', async () => {
    const { request, locale, cache } = mount({
      draft: { placeId: 'sao-paulo-bela-vista', questionDraft: ' <img src=x> private draft ' },
    });
    const draft = await screen.findByRole('textbox', { name: 'Question draft' });
    expect(draft).toHaveValue('<img src=x> private draft');
    expect(request.mock.calls.some(([url]) => /\/ask\/|\/runs\/|\/threads\//.test(url))).toBe(
      false,
    );
    await userEvent.type(draft, ' edited');
    await userEvent.click(screen.getByRole('button', { name: 'Follow the prepared example' }));
    await screen.findByRole('heading', { name: completed.question });
    await screen.findByText('R$ 10,000.00', { exact: false });
    expect(draft).toHaveValue('<img src=x> private draft edited');
    expect(
      request.mock.calls.every(
        ([url, init]) => !url.includes('private') && (!init?.method || init.method === 'GET'),
      ),
    ).toBe(true);
    expect(
      JSON.stringify(
        cache
          .getQueryCache()
          .getAll()
          .map((entry) => entry.queryKey),
      ),
    ).not.toMatch(/private draft|prepared-capability/);
    const requests = request.mock.calls.length;
    await act(() => locale.changeLanguage('pt-BR'));
    expect(screen.getByRole('textbox', { name: 'Rascunho da pergunta' })).toHaveValue(
      '<img src=x> private draft edited',
    );
    expect(screen.getByText('R$ 10.000,00', { exact: false })).toBeVisible();
    expect(request).toHaveBeenCalledTimes(requests);
    expect(localStorage.length).toBe(0);
  });
  it('inspects unavailable history then returns to streamed completion without fixed-GET rollback', async () => {
    mount();
    await screen.findByRole('button', { name: 'Follow the prepared example' });
    await userEvent.click(screen.getByRole('button', { name: 'Follow the prepared example' }));
    await screen.findByText('R$ 10,000.00', { exact: false });
    await userEvent.click(
      screen.getByRole('button', { name: new RegExp(prior.question.replace('?', '\\?')) }),
    );
    expect(screen.getByRole('heading', { name: prior.question })).toBeVisible();
    expect(screen.queryByText('R$ 10,000.00', { exact: false })).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: new RegExp(completed.question.replace('?', '\\?')) }),
    );
    expect(screen.getByText('R$ 10,000.00', { exact: false })).toBeVisible();
  });
  it('sanitizes failed reads and manually recovers without automatic authority retry', async () => {
    const { request, options } = mount({ fail: true });
    await screen.findByRole('button', { name: 'Follow the prepared example' });
    await userEvent.click(screen.getByRole('button', { name: 'Follow the prepared example' }));
    await screen.findByRole('alert');
    expect(document.body).not.toHaveTextContent('private authority');
    expect(request.mock.calls.filter(([url]) => url.endsWith('/ask/fixtures'))).toHaveLength(1);
    options.fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('R$ 10,000.00', { exact: false });
  });
  it('retains interrupted evidence and manually resumes with cursor instead of replacing with GET', async () => {
    const { options, request } = mount({ interrupted: true });
    await screen.findByRole('button', { name: 'Follow the prepared example' });
    await userEvent.click(screen.getByRole('button', { name: 'Follow the prepared example' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('heading', { name: queued.question })).toBeVisible();
    expect(request.mock.calls.filter(([url]) => url.endsWith('/events'))).toHaveLength(2);
    options.interrupted = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('R$ 10,000.00', { exact: false });
    expect(request.mock.calls.filter(([url]) => url === `/api/v1/runs/${runId}`)).toHaveLength(1);
  });
  it('aborts obsolete streams and clears authority-scoped ordinary cache on unmount', async () => {
    const { request, view, cache } = mount();
    let signal: AbortSignal | undefined;
    const cancel = vi.fn();
    const normal = request.getMockImplementation()!;
    request.mockImplementation(async (input, init) =>
      input.endsWith('/events')
        ? ((signal = init?.signal ?? undefined),
          new Response(new ReadableStream<Uint8Array>({ cancel }), {
            headers: { 'content-type': 'text/event-stream' },
          }))
        : normal(input, init),
    );
    await screen.findByRole('button', { name: 'Follow the prepared example' });
    await userEvent.click(screen.getByRole('button', { name: 'Follow the prepared example' }));
    await waitFor(() => expect(signal).toBeDefined());
    view.unmount();
    await waitFor(() => expect(cancel).toHaveBeenCalledOnce());
    expect(signal!.aborted).toBe(true);
    await waitFor(() =>
      expect(cache.getQueryCache().findAll({ queryKey: ['ask'] })).toHaveLength(0),
    );
  });
  it.each([
    null,
    {},
    { placeId: 'other', questionDraft: 'private mismatch' },
    { placeId: 'sao-paulo-bela-vista', questionDraft: 2 },
  ])('ignores invalid or mismatched draft state %j', async (draft) => {
    mount({ draft });
    expect(await screen.findByRole('textbox', { name: 'Question draft' })).toHaveValue('');
  });
  it('rejects invalid place before HTTP', () => {
    const { request } = mount({ path: '/ask/bad!' });
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid place identifier');
    expect(request).not.toHaveBeenCalled();
  });
});
