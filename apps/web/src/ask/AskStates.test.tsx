// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { ASK_STATES } from '@rei/contracts';
import { AppRoutes } from '../routes';
import { createLocale } from '../places/locale';
import { createReadCache } from '../places/place-queries';
import { overviewFixture } from '../places/overview-fixtures.test';
import { askEnglish, askPortuguese } from './ask-resources';
import { AskConfirmation } from './AskConfirmation';
import { awaiting, confirmationFrames, metadata, prior, stateSnapshots } from './ask-fixtures.test';

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
function mount(language: 'en' | 'pt-BR' = 'en') {
  const options = { refuse: false, mismatch: false, corrupt: false };
  const request = vi.fn(async (url: string, init?: RequestInit): Promise<Response> => {
    void init;
    if (url.endsWith('/ask/fixtures'))
      return Response.json({
        ...base,
        items: stateSnapshots.map((run) => ({
          runId: run.id,
          threadId: run.threadId,
          state: run.state,
          grant: { scope: 'synthetic-fixture', capability: `prepared-capability-${run.state}` },
        })),
      });
    if (url.endsWith('/ask/capabilities'))
      return Response.json({
        ...base,
        mode: 'prepared-fixtures',
        commandHandlers: false,
        intents: [
          { intent: 'price_per_square_meter', available: true },
          { intent: 'unavailable', available: false },
        ],
      });
    if (url.endsWith('/events')) {
      const frames = options.corrupt ? confirmationFrames.slice(0, 1) : confirmationFrames;
      return new Response(
        frames
          .map(
            (frame) => `id: ${frame.id}\nevent: ${frame.event}\ndata: ${JSON.stringify(frame)}\n\n`,
          )
          .join('') + (options.corrupt ? 'data: private invalid\n\n' : ''),
        { headers: { 'content-type': 'text/event-stream' } },
      );
    }
    if (url.includes('/runs/')) {
      if (options.refuse) return new Response('private read refusal', { status: 403 });
      const run = stateSnapshots.find((run) => url.endsWith(run.id));
      return Response.json(options.mismatch ? stateSnapshots[0] : run);
    }
    if (url.includes('/threads/')) {
      const run = stateSnapshots.find((run) => url.endsWith(run.threadId))!;
      return Response.json({
        ...base,
        id: run.threadId,
        principalId: null,
        runs: [{ ...prior, threadId: run.threadId }, run],
      });
    }
    return Response.json(overviewFixture(url));
  });
  vi.stubGlobal('fetch', request);
  const cache = createReadCache();
  caches.push(cache);
  const locale = createLocale(language);
  const view = render(
    <I18nextProvider i18n={locale}>
      <QueryClientProvider client={cache}>
        <MemoryRouter initialEntries={['/ask/sao-paulo-bela-vista']}>
          <AppRoutes />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
  return {
    request,
    cache,
    locale,
    view,
    options,
    text: language === 'en' ? askEnglish : askPortuguese,
  };
}
async function select(state: string, label = askEnglish.inspectState) {
  await userEvent.selectOptions(await screen.findByRole('combobox', { name: label }), state);
  await waitFor(() => expect(document.querySelector('.ask-record .st')).toBeInTheDocument());
}

it('restores exact cents and fractional area without floating-point price conversion', async () => {
  const onChange = vi.fn();
  render(
    <I18nextProvider i18n={createLocale('en')}>
      <AskConfirmation
        run={{
          ...awaiting,
          originalInputs: {
            priceMinorUnits: Number.MAX_SAFE_INTEGER,
            currency: 'BRL',
            areaSquareMeters: 80.123456789,
          },
        }}
        draft={undefined}
        onChange={onChange}
        onRephrase={vi.fn()}
      />
    </I18nextProvider>,
  );
  expect(screen.getByRole('textbox', { name: askEnglish.draftPrice })).toHaveValue(
    '90071992547409.91',
  );
  expect(screen.getByRole('textbox', { name: askEnglish.draftArea })).toHaveValue('80.123456789');
  await userEvent.click(screen.getByRole('button', { name: askEnglish.restoreOperands }));
  expect(onChange).toHaveBeenCalledWith({ price: '90071992547409.91', area: '80.123456789' });
});

it.each(
  (['en', 'pt-BR'] as const).flatMap((language) =>
    ASK_STATES.map((state) => ({ language, state })),
  ),
)(
  'inspects the real $state snapshot without automatic preview in $language',
  async ({ language, state }) => {
    const { request, text } = mount(language);
    await screen.findByRole('combobox', { name: text.inspectState });
    if (state === 'queued')
      await userEvent.click(screen.getByRole('button', { name: text.inspect }));
    else await select(state, text.inspectState);
    await waitFor(() =>
      expect(document.querySelector('.ask-record .st')).toHaveTextContent(text[state]),
    );
    expect(document.querySelectorAll('.ask-record .steps li')).toHaveLength(
      stateSnapshots.find((run) => run.state === state)!.steps.length,
    );
    expect(screen.getByText(text.runtimeUnknown)).toBeVisible();
    if (state === 'completed')
      expect(document.querySelector('.fig__value')).toHaveTextContent(
        language === 'en' ? 'R$ 10,000.00' : 'R$ 10.000,00',
      );
    else expect(document.querySelector('.fig__value')).toBeNull();
    if (state === 'failed') expect(screen.getByText(text.fixture_failure)).toBeVisible();
    if (state === 'cancelled') expect(screen.getByText(text.visitor_cancelled)).toBeVisible();
    if (state === 'expired') expect(screen.getByText(text.confirmation_expired)).toBeVisible();
    if (['failed', 'cancelled', 'expired'].includes(state)) {
      expect(screen.getByText(text.terminalNoResult)).toBeVisible();
      expect(screen.queryByText(text.noResult)).not.toBeInTheDocument();
    }
    if (state === 'cancelled' || state === 'expired') {
      expect(screen.getByRole('heading', { name: text.historicalProposal })).toBeVisible();
      expect(screen.queryByRole('heading', { name: text.proposal })).not.toBeInTheDocument();
      expect(document.querySelector('.ask-confirmation')).toHaveClass('ask-confirmation--recorded');
    }
    expect(request.mock.calls.some(([url]) => url.endsWith('/events'))).toBe(false);
  },
);

it('keeps edits private through locale/history, resets and focuses the unsent question', async () => {
  const { request, locale } = mount();
  await select('awaiting_confirmation');
  expect(screen.getByRole('img', { name: 'Confidence 0.64, threshold 0.85' })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Check the proposal' })).toBeVisible();
  const price = screen.getByRole('textbox', { name: askEnglish.draftPrice });
  const area = screen.getByRole('textbox', { name: askEnglish.draftArea });
  expect(price).toHaveValue('800000');
  expect(area).toHaveValue('80');
  await userEvent.clear(price);
  await userEvent.type(price, 'private-operand');
  await userEvent.clear(area);
  await userEvent.type(screen.getByRole('textbox', { name: 'Question draft' }), 'private question');
  const reads = request.mock.calls.length;
  await act(() => locale.changeLanguage('pt-BR'));
  expect(screen.getByRole('textbox', { name: askPortuguese.draftPrice })).toHaveValue(
    'private-operand',
  );
  expect(request).toHaveBeenCalledTimes(reads);
  await userEvent.click(screen.getByRole('button', { name: /Can this fixture predict/ }));
  expect(screen.getByText(askPortuguese.recognizedUnavailable)).toBeVisible();
  expect(screen.getByRole('link', { name: askPortuguese.search })).toHaveAttribute(
    'href',
    '/search/sao-paulo-bela-vista',
  );
  await userEvent.click(screen.getByRole('button', { name: /What is the asking/ }));
  expect(screen.getByRole('textbox', { name: askPortuguese.draftPrice })).toHaveValue(
    'private-operand',
  );
  expect(screen.getByRole('textbox', { name: askPortuguese.draftArea })).toHaveValue('');
  await userEvent.click(screen.getByRole('button', { name: askPortuguese.rephrase }));
  expect(screen.getByRole('textbox', { name: askPortuguese.draftTitle })).toHaveFocus();
  expect(screen.getByRole('textbox', { name: askPortuguese.draftTitle })).toHaveValue(
    'private question',
  );
  await userEvent.click(screen.getByRole('button', { name: askPortuguese.restoreOperands }));
  expect(screen.getByRole('textbox', { name: askPortuguese.draftPrice })).toHaveValue('800000');
  expect(screen.getByRole('textbox', { name: askPortuguese.draftArea })).toHaveValue('80');
  expect(
    request.mock.calls.every(
      ([url, init]) =>
        !url.includes('private') && (!init?.method || init.method === 'GET') && !init?.body,
    ),
  ).toBe(true);
  expect(localStorage.length).toBe(0);
});

it('only reads recorded continuation explicitly and retains actual original and recorded evidence', async () => {
  const { request } = mount();
  await select('awaiting_confirmation');
  await userEvent.clear(screen.getByRole('textbox', { name: askEnglish.draftPrice }));
  await userEvent.type(screen.getByRole('textbox', { name: askEnglish.draftPrice }), '123');
  expect(document.body).not.toHaveTextContent('R$ 810,000.00');
  expect(document.querySelector('.fig__value')).toBeNull();
  expect(request.mock.calls.some(([url]) => url.endsWith('/events'))).toBe(false);
  await userEvent.click(screen.getByRole('button', { name: askEnglish.readPreview }));
  await waitFor(() =>
    expect(document.querySelector('.fig__value')).toHaveTextContent('R$ 9,000.00'),
  );
  const recorded = within(document.querySelector('.ask-recorded-confirmation') as HTMLElement);
  expect(recorded.getByText('R$ 800,000.00 · 80 m²')).toBeVisible();
  expect(recorded.getByText('R$ 810,000.00 · 90 m²')).toBeVisible();
  expect(recorded.getByText(askEnglish.recordedBoundary)).toBeVisible();
  expect(screen.getByRole('textbox', { name: askEnglish.draftPrice })).toHaveValue('123');
  expect(screen.getByRole('heading', { name: askEnglish.historicalProposal })).toBeVisible();
  expect(screen.queryByRole('heading', { name: askEnglish.proposal })).not.toBeInTheDocument();
  expect(document.querySelector('.ask-confirmation')).toHaveClass('ask-confirmation--recorded');
  expect(screen.getByText('R$ 810,000.00 ÷ 90 m²')).toBeVisible();
  expect(request.mock.calls.filter(([url]) => url.endsWith('/events'))).toHaveLength(1);
  expect(request.mock.calls.filter(([url]) => url === `/api/v1/runs/${awaiting.id}`)).toHaveLength(
    1,
  );
});

it.each(['refuse', 'mismatch'] as const)(
  'sanitizes %s and retries the selected snapshot without following',
  async (fault) => {
    const { options, request } = mount();
    options[fault] = true;
    await userEvent.selectOptions(
      await screen.findByRole('combobox', { name: 'Run state' }),
      'awaiting_confirmation',
    );
    await screen.findByRole('alert');
    expect(document.body).not.toHaveTextContent('private read refusal');
    options[fault] = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByRole('heading', { name: askEnglish.proposal });
    expect(request.mock.calls.some(([url]) => url.endsWith('/events'))).toBe(false);
  },
);

it('retains a paused record and edited operands across corrupt preview and manual cursor recovery', async () => {
  const { options, request } = mount();
  options.corrupt = true;
  await select('awaiting_confirmation');
  await userEvent.clear(screen.getByRole('textbox', { name: askEnglish.draftArea }));
  await userEvent.type(screen.getByRole('textbox', { name: askEnglish.draftArea }), 'invalid area');
  await userEvent.click(screen.getByRole('button', { name: askEnglish.readPreview }));
  await screen.findByRole('alert');
  expect(screen.getByRole('textbox', { name: askEnglish.draftArea })).toHaveValue('invalid area');
  expect(document.querySelector('.fig__value')).toBeNull();
  options.corrupt = false;
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() =>
    expect(document.querySelector('.fig__value')).toHaveTextContent('R$ 9,000.00'),
  );
  const eventReads = request.mock.calls.filter(([url]) => url.endsWith('/events'));
  expect(eventReads).toHaveLength(2);
  expect(eventReads[1]![1]?.headers).toMatchObject({ 'Last-Event-ID': `${awaiting.id}:v1:1` });
  expect(request.mock.calls.filter(([url]) => url === `/api/v1/runs/${awaiting.id}`)).toHaveLength(
    1,
  );
  expect(document.body).not.toHaveTextContent('private invalid');
});

it('aborts an old pending read and removes its scoped cache when another state is selected', async () => {
  const { request, cache } = mount();
  const normal = request.getMockImplementation()!;
  let release: ((value: Response) => void) | undefined;
  let oldSignal: AbortSignal | undefined;
  request.mockImplementation(async (url, init) => {
    if (url === `/api/v1/runs/${awaiting.id}`) {
      oldSignal = init?.signal ?? undefined;
      return new Promise<Response>((resolve) => {
        release = resolve;
      });
    }
    return normal(url, init);
  });
  const state = await screen.findByRole('combobox', { name: 'Run state' });
  await userEvent.selectOptions(state, 'awaiting_confirmation');
  await waitFor(() => expect(oldSignal).toBeDefined());
  await userEvent.selectOptions(state, 'failed');
  await screen.findByText(askEnglish.fixture_failure);
  expect(oldSignal!.aborted).toBe(true);
  await act(async () => release!(Response.json(awaiting)));
  expect(screen.queryByRole('heading', { name: askEnglish.proposal })).not.toBeInTheDocument();
  await waitFor(() => expect(cache.getQueryCache().findAll({ queryKey: ['ask'] })).toHaveLength(4));
});

it('abandons an old preview stream on state selection without cancelling a run', async () => {
  const { request } = mount();
  const normal = request.getMockImplementation()!;
  const cancel = vi.fn();
  let signal: AbortSignal | undefined;
  request.mockImplementation(async (url, init) =>
    url.endsWith('/events')
      ? ((signal = init?.signal ?? undefined),
        new Response(new ReadableStream<Uint8Array>({ cancel }), {
          headers: { 'content-type': 'text/event-stream' },
        }))
      : normal(url, init),
  );
  await select('awaiting_confirmation');
  await userEvent.click(screen.getByRole('button', { name: askEnglish.readPreview }));
  await waitFor(() => expect(signal).toBeDefined());
  await select('cancelled');
  await screen.findByText(askEnglish.visitor_cancelled);
  await waitFor(() => expect(cancel).toHaveBeenCalledOnce());
  expect(signal!.aborted).toBe(true);
  expect(request.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true);
});
