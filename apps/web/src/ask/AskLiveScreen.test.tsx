// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, useNavigate } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { parseRoutedAskLiveRun, type RoutedLiveRun, type ModelExplanation } from '@rei/contracts';
import { AppRoutes } from '../routes';
import { createLocale } from '../places/locale';
import { createReadCache } from '../places/place-queries';
import { overviewFixture } from '../places/overview-fixtures.test';
import {
  queued,
  paused,
  confirmed,
  completed,
  cancelled,
  runId,
  threadId,
  wire,
} from '../headless/ask-fixtures.test';
import { askEnglish as text, askPortuguese } from './ask-resources';

const placeId = 'sao-paulo-bela-vista';
const explanation: ModelExplanation = {
  version: 1,
  eventId: runId,
  runId,
  threadId,
  explanationId: '019ddddd-1234-7123-8123-123456789abc',
  toolReceiptId: '019eeeee-1234-7123-8123-123456789abc',
  reservationId: '019fffff-1234-7123-8123-123456789abc',
  authorship: 'model-written',
  promptVersion: 'price-explanation-prompt-v1',
  grammarVersion: 'price-explanation-facts-v1',
  locale: 'en',
  text: 'The asking price divided by area is the returned deterministic value.',
  model: 'anthropic/claude-haiku-5.5',
  route: 'vercel-ai-gateway',
  privacyEvidenceId: 'public-privacy-evidence-id',
  outputTokens: 30,
  acceptedAt: completed.updatedAt,
};
function explained(run: RoutedLiveRun, overrides: Partial<RoutedLiveRun> = {}) {
  return parseRoutedAskLiveRun({
    ...run,
    ...overrides,
    basis: 'routed-text-explanation-v1',
    locale: 'en',
    placeId,
    explanation: run.result?.kind === 'price_per_square_meter' ? explanation : null,
  });
}
const caches: ReturnType<typeof createReadCache>[] = [];
afterEach(async () => {
  cleanup();
  for (const cache of caches.splice(0)) {
    await cache.cancelQueries();
    cache.clear();
  }
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});
function Navigation() {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => {
        void navigate('/ask/sao-paulo-pinheiros');
      }}
    >
      Change place
    </button>
  );
}
function mount() {
  const options = {
    admissionStatus: 200,
    uncertain: false,
    confirmationStatus: 200,
    failStream: false,
    missingOperands: false,
  };
  const streams: ReadableStreamDefaultController<Uint8Array>[] = [];
  const records: RoutedLiveRun[] = [];
  const request = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/api/v1/runs')) {
      if (options.uncertain) throw new TypeError('private failure');
      if (options.admissionStatus !== 200)
        return Response.json(
          { code: 'quota_exceeded', scope: 'visitor', reopensAt: '2026-10-27T00:00:00.000Z' },
          { status: options.admissionStatus },
        );
      const input: unknown = JSON.parse(String(init?.body));
      if (
        !input ||
        typeof input !== 'object' ||
        !('query' in input) ||
        typeof input.query !== 'string'
      )
        throw new Error('invalid test request');
      const id = records.length ? runId.slice(0, -1) + 'd' : runId;
      records.push(
        explained(queued, {
          id,
          question: input.query,
          originalInputs: options.missingOperands ? null : queued.originalInputs,
        }),
      );
      return Response.json({
        mode: 'routed-text-explanation-v1',
        runId: id,
        threadId,
        state: 'queued',
      });
    }
    if (url.endsWith('/events')) {
      if (options.failStream) return new Response('', { status: 503 });
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            streams.push(controller);
          },
        }),
        { headers: { 'content-type': 'text/event-stream' } },
      );
    }
    if (url.endsWith('/confirm'))
      return options.confirmationStatus === 200
        ? Response.json(
            explained(confirmed, {
              question: records.at(-1)!.question,
              originalInputs: records.at(-1)!.originalInputs,
            }),
          )
        : new Response('private conflict', { status: options.confirmationStatus });
    if (url.endsWith('/cancel'))
      return Response.json(
        explained(cancelled, { id: records.at(-1)!.id, question: records.at(-1)!.question }),
      );
    return Response.json(overviewFixture(url));
  });
  vi.stubGlobal('fetch', request);
  const locale = createLocale('en');
  const cache = createReadCache();
  caches.push(cache);
  const view = render(
    <I18nextProvider i18n={locale}>
      <QueryClientProvider client={cache}>
        <MemoryRouter initialEntries={['/ask/' + placeId]}>
          <Navigation />
          <AppRoutes />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
  async function submit(query = queued.question) {
    const draft = await screen.findByRole('textbox', { name: text.draftTitle });
    await userEvent.clear(draft);
    await userEvent.type(draft, query);
    await userEvent.click(screen.getByRole('button', { name: text.submitLive }));
    if (!options.uncertain && options.admissionStatus === 200 && !options.failStream)
      await waitFor(() => expect(streams.length).toBeGreaterThan(0));
  }
  async function emit(run: RoutedLiveRun, sequence: number, streamIndex = streams.length - 1) {
    const record = records.at(-1)!;
    const snapshot = explained(run, {
      id: record.id,
      question: record.question,
      originalInputs: record.originalInputs,
    });
    await act(async () => {
      streams[streamIndex]!.enqueue(new TextEncoder().encode(wire(snapshot, sequence)));
    });
  }
  return { request, options, streams, records, locale, cache, view, submit, emit };
}
it('submits once, shows exact server result and model provenance, switches locale and keeps authority private', async () => {
  const test = mount();
  await test.submit();
  expect(screen.getByRole('button', { name: text.submitLive })).toBeDisabled();
  fireEvent.submit(screen.getByRole('textbox', { name: text.draftTitle }).closest('form')!);
  expect(test.request.mock.calls.filter(([url]) => url.endsWith('/api/v1/runs'))).toHaveLength(1);
  await test.emit(completed, 1);
  expect(await screen.findByText(text.modelWritten)).toBeVisible();
  expect(screen.getByText(explanation.text)).toBeVisible();
  expect(screen.getByText(explanation.model)).toBeVisible();
  expect(screen.getByText(explanation.toolReceiptId)).toBeVisible();
  expect(document.querySelector('.fig__value')).toHaveTextContent('R$ 10,000.00');
  const create = test.request.mock.calls.find(([url]) => url.endsWith('/api/v1/runs'))!;
  expect(JSON.parse(String(create[1]?.body))).toMatchObject({
    mode: 'routed-text-explanation-v1',
    placeId,
    locale: 'en',
    query: queued.question,
  });
  const capability = new Headers(create[1]?.headers).get('authorization')!;
  expect(capability).toMatch(/^Bearer [A-Za-z0-9_-]{43}$/);
  expect(test.request.mock.calls.every(([url]) => !url.includes(capability.slice(7)))).toBe(true);
  expect(
    JSON.stringify(
      test.cache
        .getQueryCache()
        .getAll()
        .map((entry) => entry.queryKey),
    ),
  ).not.toContain(capability.slice(7));
  expect(localStorage.length + sessionStorage.length).toBe(0);
  await act(() => test.locale.changeLanguage('pt-BR'));
  expect(document.querySelector('.fig__value')).toHaveTextContent('R$ 10.000,00');
  expect(screen.getByText(askPortuguese.modelWritten)).toBeVisible();
});
it('binds explicit edited confirmation to the accepted receipt and waits for the real terminal', async () => {
  const test = mount();
  await test.submit();
  await test.emit(paused, 1);
  expect(screen.getByRole('img', { name: 'Confidence 0.84, threshold 0.85' })).toBeVisible();
  const price = screen.getByRole('textbox', { name: text.draftPrice });
  await userEvent.clear(price);
  await userEvent.type(price, 'invalid');
  await userEvent.click(screen.getByRole('button', { name: text.confirmLive }));
  expect(screen.getByRole('alert')).toHaveTextContent(text.invalidOperands);
  expect(test.request.mock.calls.some(([url]) => url.endsWith('/confirm'))).toBe(false);
  await userEvent.clear(price);
  await userEvent.type(price, '680000,00');
  await userEvent.click(screen.getByRole('button', { name: text.confirmLive }));
  const confirmation = test.request.mock.calls.find(([url]) => url.endsWith('/confirm'))!;
  expect(JSON.parse(String(confirmation[1]?.body))).toEqual({
    runId,
    decisionReceiptId: paused.decision!.receiptId,
    inputs: confirmed.confirmation!.inputs,
  });
  expect(document.querySelector('.fig__value')).toBeNull();
  await test.emit(confirmed, 2);
  await test.emit(completed, 3);
  const accepted = within(document.querySelector('.ask-recorded-confirmation') as HTMLElement);
  expect(accepted.getByText('R$ 680,000.00 · 68 m²')).toBeVisible();
  expect(accepted.getByText('R$ 785,000.00 · 68 m²')).toBeVisible();
  expect(screen.getByText(text.liveCompleted)).toBeVisible();
});
it('allows missing original operands to be supplied and retains edits after conflicting confirmation', async () => {
  const test = mount();
  test.options.missingOperands = true;
  await test.submit();
  await test.emit(paused, 1);
  expect(screen.getByText(text.missingOperands, { exact: false })).toBeVisible();
  expect(screen.getByRole('textbox', { name: text.draftPrice })).toHaveValue('');
  await userEvent.type(screen.getByRole('textbox', { name: text.draftPrice }), '680000.00');
  await userEvent.type(screen.getByRole('textbox', { name: text.draftArea }), '68');
  test.options.confirmationStatus = 409;
  await userEvent.click(screen.getByRole('button', { name: text.confirmLive }));
  expect(await screen.findByRole('alert')).toHaveTextContent(text.liveConflict);
  expect(screen.getByRole('textbox', { name: text.draftPrice })).toHaveValue('680000.00');
  expect(document.querySelector('.fig__value')).toBeNull();
});
it('retries uncertain admission with the same immutable body, capability and idempotency key', async () => {
  const test = mount();
  test.options.uncertain = true;
  await test.submit();
  await screen.findByRole('alert');
  await userEvent.type(screen.getByRole('textbox', { name: text.draftTitle }), ' edited');
  test.options.uncertain = false;
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(test.streams).toHaveLength(1));
  const calls = test.request.mock.calls.filter(([url]) => url.endsWith('/api/v1/runs'));
  expect(calls).toHaveLength(2);
  expect(calls[0]![1]?.body).toBe(calls[1]![1]?.body);
  expect(calls[0]![1]?.headers).toEqual(calls[1]![1]?.headers);
});
it('shows validated quota reset evidence without automatic command retries', async () => {
  const test = mount();
  test.options.admissionStatus = 429;
  await test.submit();
  expect(await screen.findByRole('alert')).toHaveTextContent(text.liveQuota);
  expect(screen.getByText('Visitor limit. Reopens at')).toBeVisible();
  expect(document.querySelector('time[datetime="2026-10-27T00:00:00.000Z"]')).toBeVisible();
  expect(test.request.mock.calls.filter(([url]) => url.endsWith('/api/v1/runs'))).toHaveLength(1);
});
it('recovers interrupted SSE with the accepted cursor and does not create another run', async () => {
  const test = mount();
  await test.submit();
  await test.emit(paused, 1);
  test.options.failStream = true;
  await act(async () => test.streams[0]!.close());
  expect(await screen.findByRole('alert')).toHaveTextContent(text.liveInterrupted);
  expect(screen.getByRole('heading', { name: paused.question })).toBeVisible();
  test.options.failStream = false;
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(test.streams).toHaveLength(2));
  const eventReads = test.request.mock.calls.filter(([url]) => url.endsWith('/events'));
  expect(new Headers(eventReads.at(-1)![1]?.headers).get('Last-Event-ID')).toBe(`${runId}:v1:1`);
  await test.emit(completed, 2);
  expect(await screen.findByText(text.liveCompleted)).toBeVisible();
  expect(test.request.mock.calls.filter(([url]) => url.endsWith('/api/v1/runs'))).toHaveLength(1);
});
it('cancels explicitly with the returned terminal while unmount only aborts transport', async () => {
  const test = mount();
  await test.submit();
  await test.emit(paused, 1);
  await userEvent.click(screen.getByRole('button', { name: text.cancelLive }));
  expect(await screen.findByText(text.live_visitor_cancelled)).toBeVisible();
  expect(test.request.mock.calls.filter(([url]) => url.endsWith('/cancel'))).toHaveLength(1);
  test.view.unmount();
  expect(test.request.mock.calls.filter(([url]) => url.endsWith('/cancel'))).toHaveLength(1);
});
it('cancels an accepted run after repeated pre-frame stream failures using its admitted identity', async () => {
  const test = mount();
  test.options.failStream = true;
  await test.submit();
  expect(await screen.findByRole('alert')).toHaveTextContent(text.liveInterrupted);
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(text.liveInterrupted);
  expect(test.request.mock.calls.filter(([url]) => url.endsWith('/events'))).toHaveLength(2);
  expect(test.streams).toHaveLength(0);
  expect(screen.queryByRole('button', { name: text.confirmLive })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: text.cancelLive }));
  expect(await screen.findByText(text.live_visitor_cancelled)).toBeVisible();
  const admission = test.request.mock.calls.find(([url]) => url.endsWith('/api/v1/runs'))!;
  const cancellation = test.request.mock.calls.find(([url]) => url.endsWith('/cancel'))!;
  expect(cancellation[0]).toContain(`/runs/${runId}/cancel`);
  expect(new Headers(cancellation[1]?.headers).get('authorization')).toBe(
    new Headers(admission[1]?.headers).get('authorization'),
  );
  expect(test.request.mock.calls.filter(([url]) => url.endsWith('/api/v1/runs'))).toHaveLength(1);
});
it('rejects a command response that replaces the accepted decision receipt', async () => {
  const test = mount();
  await test.submit();
  await test.emit(paused, 1);
  const normal = test.request.getMockImplementation()!;
  test.request.mockImplementation(async (url, init) =>
    url.endsWith('/cancel')
      ? Response.json(
          explained(cancelled, {
            question: test.records.at(-1)!.question,
            decision: {
              ...cancelled.decision!,
              receiptId: '019eeeee-1234-7123-8123-123456789abc',
            },
          }),
        )
      : normal(url, init),
  );
  await userEvent.click(screen.getByRole('button', { name: text.cancelLive }));
  expect(await screen.findByRole('alert')).toHaveTextContent(text.liveInterrupted);
  expect(screen.queryByText(text.live_visitor_cancelled)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: text.confirmLive })).toBeVisible();
});
it('preserves a returned cancellation terminal if its older stream subsequently disconnects', async () => {
  const test = mount();
  await test.submit();
  await test.emit(paused, 1);
  await userEvent.click(screen.getByRole('button', { name: text.cancelLive }));
  expect(await screen.findByText(text.live_visitor_cancelled)).toBeVisible();
  test.options.failStream = true;
  await act(async () => test.streams[0]!.error(new TypeError('private disconnect')));
  await waitFor(() =>
    expect(test.request.mock.calls.filter(([url]) => url.endsWith('/events'))).toHaveLength(2),
  );
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByText(text.live_visitor_cancelled)).toBeVisible();
});
it('place change aborts reads and prevents stale callbacks from replacing the new place', async () => {
  const test = mount();
  await test.submit();
  await test.emit(paused, 1);
  const oldSignal = test.request.mock.calls.find(([url]) => url.endsWith('/events'))![1]?.signal;
  await userEvent.click(screen.getByRole('button', { name: 'Change place' }));
  await screen.findByRole('textbox', { name: text.draftTitle });
  expect(oldSignal?.aborted).toBe(true);
  expect(screen.queryByRole('heading', { name: paused.question })).not.toBeInTheDocument();
  expect(test.request.mock.calls.some(([url]) => url.endsWith('/cancel'))).toBe(false);
});
it('retains previous live records without replacing current authority', async () => {
  const test = mount();
  await test.submit();
  await test.emit(completed, 1);
  await test.submit('A second price question');
  await test.emit(paused, 1);
  await userEvent.click(screen.getByRole('button', { name: new RegExp(queued.question) }));
  expect(screen.getByRole('heading', { name: queued.question })).toBeVisible();
  expect(screen.queryByRole('button', { name: text.confirmLive })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /A second price question/ }));
  expect(screen.getByRole('button', { name: text.confirmLive })).toBeVisible();
  const calls = test.request.mock.calls.filter(([url]) => url.endsWith('/api/v1/runs'));
  expect(JSON.parse(String(calls[1]![1]?.body)).threadId).toBe(threadId);
});
it.each(['interruption', 'quota'] as const)(
  'keeps prior history inspectable during a second admission %s without replacing command authority',
  async (failure) => {
    const test = mount();
    await test.submit();
    await test.emit(completed, 1);
    if (failure === 'interruption') test.options.failStream = true;
    else test.options.admissionStatus = 429;
    await test.submit('A second price question');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      failure === 'interruption' ? text.liveInterrupted : text.liveQuota,
    );
    await userEvent.click(screen.getByRole('button', { name: new RegExp(queued.question) }));
    expect(screen.getByRole('heading', { name: queued.question })).toBeVisible();
    expect(screen.getByText(explanation.text)).toBeVisible();
    expect(screen.queryByRole('button', { name: text.confirmLive })).not.toBeInTheDocument();
    if (failure === 'interruption') {
      await userEvent.click(screen.getByRole('button', { name: text.cancelLive }));
      expect(await screen.findByText(text.live_visitor_cancelled)).toBeVisible();
      const cancellation = test.request.mock.calls.find(([url]) => url.endsWith('/cancel'))!;
      expect(cancellation[0]).toContain(`/runs/${test.records[1]!.id}/cancel`);
      expect(cancellation[0]).not.toContain(`/runs/${test.records[0]!.id}/cancel`);
    } else {
      expect(screen.queryByRole('button', { name: text.cancelLive })).not.toBeInTheDocument();
      expect(test.request.mock.calls.some(([url]) => url.endsWith('/cancel'))).toBe(false);
    }
  },
);

it('renders a typed unavailable live result without inventing a calculation or explanation', async () => {
  const test = mount();
  await test.submit();
  const unavailable = parseRoutedAskLiveRun({
    ...completed,
    decision: {
      ...completed.decision!,
      intent: 'unsupported',
      probabilities: {
        ...completed.decision!.probabilities,
        price_per_square_meter: 0.032,
        unsupported: 0.84,
      },
    },
    result: { kind: 'unavailable_intent', intent: 'unsupported', reason: 'not_available' },
  });
  await test.emit(unavailable, 1);
  expect(screen.getByText(text.liveUnavailable)).toBeVisible();
  expect(screen.getByText(text.liveExplanationAbsent)).toBeVisible();
  expect(document.querySelector('.fig__value')).toBeNull();
});
it('retains live authority and edited operands while inspecting a prepared read separately', async () => {
  const test = mount();
  await test.submit();
  await test.emit(paused, 1);
  const price = screen.getByRole('textbox', { name: text.draftPrice });
  await userEvent.clear(price);
  await userEvent.type(price, '1234.56');
  const liveSignal = test.request.mock.calls.find(([url]) => url.endsWith('/events'))![1]?.signal;
  await userEvent.click(screen.getByRole('button', { name: text.inspect }));
  await screen.findByRole('alert');
  expect(liveSignal?.aborted).toBe(false);
  await userEvent.click(screen.getByRole('button', { name: text.returnLive }));
  expect(screen.getByRole('textbox', { name: text.draftPrice })).toHaveValue('1234.56');
  expect(screen.getByRole('button', { name: text.confirmLive })).toBeVisible();
  expect(test.request.mock.calls.some(([url]) => url.endsWith('/cancel'))).toBe(false);
});
it('ignores late admission after a place change and never starts its obsolete stream', async () => {
  const test = mount();
  const normal = test.request.getMockImplementation()!;
  let release: ((response: Response) => void) | undefined;
  test.request.mockImplementation(async (url, init) =>
    url.endsWith('/api/v1/runs')
      ? new Promise<Response>((resolve) => {
          release = resolve;
        })
      : normal(url, init),
  );
  const draft = await screen.findByRole('textbox', { name: text.draftTitle });
  await userEvent.type(draft, queued.question);
  await userEvent.click(screen.getByRole('button', { name: text.submitLive }));
  await waitFor(() => expect(release).toBeDefined());
  await userEvent.click(screen.getByRole('button', { name: 'Change place' }));
  await screen.findByRole('textbox', { name: text.draftTitle });
  await act(async () =>
    release!(
      Response.json({ mode: 'routed-text-explanation-v1', runId, threadId, state: 'queued' }),
    ),
  );
  expect(test.request.mock.calls.some(([url]) => url.endsWith('/events'))).toBe(false);
  expect(screen.getByRole('textbox', { name: text.draftTitle })).toHaveValue('');
});
