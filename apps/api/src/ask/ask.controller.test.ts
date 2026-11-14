import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ASK_FACADE, ASK_LIVE_FACADE, type AskFacade } from '@rei/application';
import { assertAskPreview } from '@rei/domain';
import {
  parseAskAvailability,
  parseAskFixtureCatalogue,
  parseAskLiveEvent,
  parseAskProgressEvent,
  parseAskRun,
  parseAskThread,
  type AskProgressEvent,
} from '@rei/contracts';
import { concat, from, lastValueFrom, Observable, throwError, toArray } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { configureApi } from '../configure-api';
import { AskModule } from './ask.module';
import { DATABASE_CONNECTION } from '../persistence/persistence.module';
import { askBearerCapability, askPreviewStream } from './ask.controller';
import { askLiveStreamSettings } from './ask-live-stream';

function transport(text: string): AskProgressEvent[] {
  return text
    .split(/\r?\n\r?\n/)
    .filter((block) => block.trim())
    .map((block) => {
      const lines = block.split(/\r?\n/);
      const data = lines
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      const frame = parseAskProgressEvent(JSON.parse(data));
      expect(
        lines
          .find((line) => line.startsWith('id:'))
          ?.slice(3)
          .trim(),
      ).toBe(frame.id);
      expect(
        lines
          .find((line) => line.startsWith('event:'))
          ?.slice(6)
          .trim(),
      ).toBe(frame.event);
      return frame;
    });
}
describe('AskModule actual HTTP and finite SSE', () => {
  it('rejects trailing controls in the exact Bearer header before resolving authority', () => {
    const token = 'ask-fixture-v1-queued';
    expect(askBearerCapability(`Bearer ${token}`)).toBe(token);
    for (const suffix of ['\n', '\r', '\r\n', '\t', ' ']) {
      expect(() => askBearerCapability(`Bearer ${token}${suffix}`)).toThrow('Unauthorized');
    }
  });
  let app: INestApplication, base: string, facade: AskFacade;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AskModule] })
      .overrideProvider(DATABASE_CONNECTION)
      .useValue({ close: vi.fn() })
      .overrideProvider(ASK_LIVE_FACADE)
      .useValue({ run: async () => null, thread: async () => null })
      .compile();
    facade = module.get(ASK_FACADE);
    app = module.createNestApplication();
    configureApi(app);
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    if (!address || typeof address === 'string') throw new Error('Missing listener.');
    base = `http://127.0.0.1:${address.port}`;
  });
  afterAll(async () => app.close());
  async function get(path: string, headers: Record<string, string> = {}) {
    return fetch(`${base}${path}`, { headers, signal: AbortSignal.timeout(5000) });
  }
  it('preserves recorded edited confirmation across individually valid preview frames', async () => {
    const fixture = (await facade.catalogue()).items.find(
      (item) => item.state === 'awaiting_confirmation',
    )!;
    const frames = (await facade.preview(fixture.runId, fixture.grant.capability))!;
    expect(() => assertAskPreview(frames)).not.toThrow();
    const final = frames.at(-1)!;
    if (!final.run.confirmation || final.run.result?.kind !== 'price_per_square_meter')
      throw new Error('Missing recorded confirmation example.');
    for (const inputs of [
      { ...final.run.confirmation.inputs, priceMinorUnits: 90000000 },
      { ...final.run.confirmation.inputs, areaSquareMeters: 100 },
    ]) {
      const changed = {
        ...final,
        run: {
          ...final.run,
          confirmation: { ...final.run.confirmation, inputs },
          result: {
            ...final.run.result,
            inputs,
            minorUnits: Math.round(inputs.priceMinorUnits / inputs.areaSquareMeters),
          },
        },
      };
      // Each frame remains valid on its own; only the historical overwrite is invalid.
      const independentlyParsed = [...frames.slice(0, -1), changed].map(parseAskProgressEvent);
      expect(() => assertAskPreview(independentlyParsed)).toThrow('Invalid Ask preview.');
    }
  });
  async function error(path: string, status: number, headers: Record<string, string> = {}) {
    const response = await get(path, { ...headers, 'x-request-id': 'client-controlled' });
    expect(response.status).toBe(status);
    expect(response.headers.get('content-type')).toContain('application/json');
    const requestId = response.headers.get('x-request-id');
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
    const codes: Record<number, string> = {
      400: 'bad_request',
      401: 'unauthorized',
      403: 'forbidden',
      404: 'not_found',
      500: 'internal_error',
    };
    expect(await response.json()).toMatchObject({ error: { code: codes[status], requestId } });
    return response;
  }
  it('parses seven prepared run snapshots, ordered threads and finite previews through public HTTP', async () => {
    const availability = await get('/api/v1/ask/capabilities');
    expect(availability.status).toBe(200);
    expect(parseAskAvailability(await availability.json()).commandHandlers).toBe(false);
    const catalogue = parseAskFixtureCatalogue(await (await get('/api/v1/ask/fixtures')).json());
    for (const item of catalogue.items) {
      const headers = { Authorization: `Bearer ${item.grant.capability}` };
      const response = await get(`/api/v1/runs/${item.runId}`, headers);
      expect(response.status).toBe(200);
      const snapshot = parseAskRun(await response.json());
      expect(snapshot.state).toBe(item.state);
      const thread = parseAskThread(
        await (await get(`/api/v1/threads/${item.threadId}`, headers)).json(),
      );
      expect(thread.runs[1]).toEqual(snapshot);
      const stream = await get(`/api/v1/runs/${item.runId}/events`, headers);
      expect(stream.status).toBe(200);
      expect(stream.headers.get('content-type')).toContain('text/event-stream');
      const text = await stream.text(),
        frames = transport(text);
      expect(text).not.toContain(item.grant.capability);
      expect(frames[0]?.run).toEqual(snapshot);
      expect(frames.filter((frame) => frame.terminal)).toHaveLength(1);
      expect(frames.at(-1)?.terminal).toBe(true);
      expect(frames.map((frame) => frame.sequence)).toEqual(frames.map((_, index) => index + 1));
      const replay = await get(`/api/v1/runs/${item.runId}/events`, {
        ...headers,
        'Last-Event-ID': frames[0]!.id,
      });
      expect(replay.status).toBe(200);
      expect(transport(await replay.text())).toEqual(frames.slice(1));
      expect(parseAskRun(await (await get(`/api/v1/runs/${item.runId}`, headers)).json())).toEqual(
        snapshot,
      );
    }
  });
  it('refuses history and SSE authority before disclosure and canonicalizes invalid cursor/query/ID', async () => {
    const item = (await facade.catalogue()).items[0]!,
      headers = { Authorization: `Bearer ${item.grant.capability}` };
    for (const path of [
      `/runs/${item.runId}`,
      `/runs/${item.runId}/events`,
      `/threads/${item.threadId}`,
    ]) {
      await error(`/api/v1${path}`, 401);
      await error(`/api/v1${path}`, 401, { Authorization: 'Bearer short' });
      await error(`/api/v1${path}`, 403, { Authorization: 'Bearer wrong-fixture-capability' });
      await error(path, 404, headers);
      for (const query of [
        '?x=1',
        '?x[y]=1',
        '?x=1&x=2',
        '?capability=private',
        '?__proto__[private]=1',
      ])
        await error(`/api/v1${path}${query}`, 400, headers);
    }
    for (const path of ['/ask/capabilities', '/ask/fixtures']) {
      await error(path, 404);
      await error(`/api/v1${path}?x=1`, 400);
    }
    for (const id of ['bad', item.runId.toUpperCase(), item.runId.replace('7000', '4000')])
      await error(`/api/v1/runs/${id}`, 400, headers);
    for (const cursor of [
      '',
      'foreign:v1:1',
      `${item.runId}:v1:0`,
      `${item.runId}:v1:999`,
      `${item.runId}:v2:1`,
    ])
      await error(`/api/v1/runs/${item.runId}/events`, 400, {
        ...headers,
        'Last-Event-ID': cursor,
      });
  });
  it('sanitizes unexpected adapter/output errors before SSE headers and handles authorized absence', async () => {
    const item = (await facade.catalogue()).items[0]!,
      headers = { Authorization: `Bearer ${item.grant.capability}` };
    for (const [method, path] of [
      ['run', `/runs/${item.runId}`],
      ['thread', `/threads/${item.threadId}`],
      ['preview', `/runs/${item.runId}/events`],
    ] as const) {
      const spy = vi.spyOn(facade, method);
      spy.mockRejectedValueOnce(new Error('private capability/provider key'));
      await error(`/api/v1${path}`, 500, headers);
      spy.mockResolvedValueOnce({ private: 'private payload' } as never);
      await error(`/api/v1${path}`, 500, headers);
      spy.mockResolvedValueOnce(null);
      await error(`/api/v1${path}`, 404, headers);
      spy.mockRestore();
    }
  });
  it('requires authority for all live commands and keeps prepared fixtures immutable', async () => {
    const item = (await facade.catalogue()).items[0]!;
    for (const path of ['/runs', `/runs/${item.runId}/confirm`, `/runs/${item.runId}/cancel`]) {
      const response = await fetch(`${base}/api/v1${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': item.runId },
        body: JSON.stringify({ query: 'caller private text' }),
      });
      expect(response.status).toBe(401);
      expect(await response.text()).not.toContain('caller private text');
    }
  });
  it('converts a post-start source exception into a closed failed terminal and unsubscribes on terminal', async () => {
    const item = (await facade.catalogue()).items[0]!;
    const frames = (await facade.preview(item.runId, item.grant.capability))!;
    const output = await lastValueFrom(
      askPreviewStream(
        frames,
        concat(
          from(frames.slice(0, 1)),
          throwError(() => new Error('private provider secret')),
        ),
      ).pipe(toArray()),
    );
    expect(output).toHaveLength(2);
    const failed = parseAskProgressEvent(output[1]?.data);
    expect(failed.event).toBe('ask.failed');
    expect(failed.sequence).toBe(2);
    expect(failed.run.terminal?.reason).toBe('preview_unavailable');
    expect(JSON.stringify(output)).not.toContain('private provider secret');
    const firstFailure = await lastValueFrom(
      askPreviewStream(
        frames,
        throwError(() => 'private failure'),
      ).pipe(toArray()),
    );
    expect(parseAskProgressEvent(firstFailure[0]?.data).event).toBe('ask.failed');
    const teardown = vi.fn();
    const source = new Observable<AskProgressEvent>((subscriber) => {
      subscriber.next(frames.at(-1)!);
      subscriber.error(new Error('should be unreachable'));
      return teardown;
    });
    const terminalOnly = await lastValueFrom(askPreviewStream(frames, source).pipe(toArray()));
    expect(terminalOnly).toHaveLength(1);
    expect(parseAskProgressEvent(terminalOnly[0]?.data).event).toBe('ask.completed');
    expect(teardown).toHaveBeenCalledOnce();
    const disconnect = vi.fn();
    const open = askPreviewStream(frames, new Observable(() => disconnect)).subscribe();
    open.unsubscribe();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(await lastValueFrom(askPreviewStream([]).pipe(toArray()))).toEqual([]);
  });
});
it('keeps a silent live stream open with heartbeat comments over actual HTTP', async () => {
  const id = '0199c8f2-2394-7ba0-8f9e-286378779210',
    at = '2026-10-11T00:00:00.000Z',
    grant = 'c'.repeat(43);
  const queued = parseAskLiveEvent({
    version: 1,
    id: `${id}:v1:1`,
    runId: id,
    sequence: 1,
    event: 'ask.progress',
    terminal: false,
    run: {
      basis: 'structured-price-v1',
      id,
      threadId: '0199c8f2-2394-7ba0-8f9e-286378779211',
      principalId: null,
      question: 'Calculate.',
      locale: 'en',
      placeId: null,
      createdAt: at,
      updatedAt: at,
      state: 'queued',
      originalInputs: { priceMinorUnits: 100, currency: 'BRL', areaSquareMeters: 2 },
      decision: null,
      result: null,
      terminal: null,
      steps: [],
    },
  });
  const events = vi
    .fn()
    .mockImplementation((_id: string, _grant: string, after: number) =>
      Promise.resolve(after === 0 ? [queued] : []),
    );
  const module = await Test.createTestingModule({ imports: [AskModule] })
    .overrideProvider(DATABASE_CONNECTION)
    .useValue({ close: vi.fn() })
    .overrideProvider(ASK_LIVE_FACADE)
    .useValue({ run: async () => queued.run, events })
    .compile();
  const app = module.createNestApplication();
  configureApi(app);
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address();
  if (!address || typeof address === 'string') throw new Error('Missing listener.');
  // Only the heartbeat uses an interval; real HTTP and the 100 ms poll keep their real timers.
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  const stop = new AbortController();
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/runs/${id}/events`, {
      headers: { Authorization: `Bearer ${grant}` },
      signal: stop.signal,
    });
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const reader = response.body!.getReader(),
      decoder = new TextDecoder();
    let text = '';
    const until = async (marker: string) => {
      while (!text.includes(marker)) {
        const chunk = await reader.read();
        if (chunk.done) throw new Error('Stream ended early.');
        text += decoder.decode(chunk.value, { stream: true });
      }
    };
    await until(`id: ${id}:v1:1`);
    await until('\n\n');
    expect(text).not.toContain(': heartbeat');
    vi.advanceTimersByTime(askLiveStreamSettings.heartbeatIntervalMs);
    await until(': heartbeat\n\n');
    // The comment sits between complete frames and carries no event, id or data field.
    expect(text.slice(text.indexOf('\n\n') + 2)).toBe(': heartbeat\n\n');
  } finally {
    stop.abort();
    vi.useRealTimers();
    await app.close();
  }
});
