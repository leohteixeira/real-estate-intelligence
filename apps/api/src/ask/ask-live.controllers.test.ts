import { EventEmitter } from 'node:events';
import { HttpException } from '@nestjs/common';
import type { Request } from 'express';
import { AskLiveError, AskQuotaError } from '@rei/application';
import { parseAskLiveRun } from '@rei/contracts';
import { askDispatchProof } from '@rei/infrastructure';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AskLiveController, liveAuthorized } from './ask-live.controller';
import { AskDispatchController } from './ask-dispatch.controller';
import { AskToolController } from './ask-tool.controller';
const identity = {
    version: 1 as const,
    eventId: '0199c8f2-2394-7ba0-8f9e-286378779212',
    runId: '0199c8f2-2394-7ba0-8f9e-286378779210',
    threadId: '0199c8f2-2394-7ba0-8f9e-286378779211',
  },
  executionId = '0199c8f2-2394-7ba0-8f9e-286378779213',
  at = '2026-10-11T00:00:00.000Z',
  secret = 's'.repeat(43),
  capability = 'c'.repeat(43);
const inputs = { priceMinorUnits: 100, currency: 'BRL' as const, areaSquareMeters: 2 };
const queued = parseAskLiveRun({
  basis: 'structured-price-v1',
  id: identity.runId,
  threadId: identity.threadId,
  principalId: null,
  question: 'Calculate.',
  locale: 'en',
  placeId: null,
  createdAt: at,
  updatedAt: at,
  state: 'queued',
  originalInputs: inputs,
  decision: null,
  result: null,
  terminal: null,
  steps: [],
});
const failed = parseAskLiveRun({
  ...queued,
  state: 'failed',
  decision: { source: 'fixed-structured-v1', intent: 'price_per_square_meter', decidedAt: at },
  steps: [
    { sequence: 1, phase: 'calculating', at },
    { sequence: 2, phase: 'failed', at },
  ],
  terminal: { state: 'failed', reason: 'execution_unavailable', at },
});
const create = {
  mode: 'structured-price-v1',
  threadId: null,
  placeId: null,
  query: 'Calculate.',
  locale: 'en',
  inputs,
};
function req(authorization?: string, originalUrl = '/api/v1/runs') {
  return Object.assign(new EventEmitter(), {
    headers: { authorization, 'idempotency-key': 'request-key-123456' },
    aborted: false,
    originalUrl,
  }) as unknown as Request;
}
function facade() {
  return {
    createRouted: vi.fn(),
    confirm: vi.fn(),
    refuse: vi.fn(),
    cancel: vi.fn(),
    executeDecision: vi.fn(),
    expireQueued: vi.fn().mockResolvedValue(0),
    create: vi.fn().mockResolvedValue(queued),
    createText: vi
      .fn()
      .mockResolvedValue({ kind: 'accepted', run: { ...queued, basis: 'text-price-v1' } }),
    claim: vi.fn().mockResolvedValue({ disposition: 'busy', identity, retryAfterMs: 30000 }),
    complete: vi.fn().mockResolvedValue(failed),
    tool: vi.fn(),
    run: vi.fn(),
    thread: vi.fn(),
    events: vi.fn(),
  };
}
afterEach(() => vi.unstubAllEnvs());
describe('scoped Ask command, dispatch and tool boundaries', () => {
  it('routes closed public create, confirmation and cancellation with request signals', async () => {
    vi.stubEnv('ASK_DISPATCH_SECRET', secret);
    const live = facade(),
      controller = new AskLiveController(live);
    const routed = parseAskLiveRun({
      ...queued,
      basis: 'routed-text-v1',
      confirmation: null,
      confirmationDeadline: null,
    });
    live.createRouted.mockResolvedValue(routed);
    live.confirm.mockResolvedValue(routed);
    live.cancel.mockResolvedValue(routed);
    const body = {
      mode: 'routed-text-v1',
      threadId: null,
      placeId: null,
      query: 'Calculate.',
      locale: 'en',
    };
    expect(await controller.create(body, req(`Bearer ${capability}`))).toEqual({
      mode: body.mode,
      runId: routed.id,
      threadId: routed.threadId,
      state: 'queued',
    });
    expect(live.createRouted).toHaveBeenCalledWith(
      body,
      capability,
      'request-key-123456',
      { visitorDigest: expect.stringMatching(/^[0-9a-f]{64}$/) },
      expect.any(AbortSignal),
    );
    const confirmation = { runId: routed.id, decisionReceiptId: identity.eventId, inputs };
    expect(await controller.confirm(routed.id, confirmation, req(`Bearer ${capability}`))).toEqual(
      routed,
    );
    expect(live.confirm).toHaveBeenCalledWith(confirmation, capability, expect.any(AbortSignal));
    expect(
      await controller.cancel(
        routed.id,
        { reason: 'visitor_cancelled' },
        req(`Bearer ${capability}`),
      ),
    ).toEqual(routed);
    expect(live.cancel).toHaveBeenCalledWith(routed.id, capability, expect.any(AbortSignal));
    live.confirm.mockClear();
    live.cancel.mockClear();
    for (const invalid of [
      { ...confirmation, runId: identity.threadId },
      { ...confirmation, extra: true },
      { ...confirmation, inputs: { ...inputs, areaSquareMeters: 0 } },
    ])
      await expect(
        controller.confirm(routed.id, invalid, req(`Bearer ${capability}`)),
      ).rejects.toThrow('Bad Request');
    for (const invalid of [{ reason: 'other' }, { reason: 'visitor_cancelled', extra: true }, {}])
      await expect(
        controller.cancel(routed.id, invalid, req(`Bearer ${capability}`)),
      ).rejects.toThrow('Bad Request');
    await expect(
      controller.cancel(
        routed.id,
        { reason: 'visitor_cancelled' },
        req(`Bearer ${capability}`, '/api/v1/runs/id/cancel?x=1'),
      ),
    ).rejects.toThrow('Bad Request');
    expect(live.confirm).not.toHaveBeenCalled();
    expect(live.cancel).not.toHaveBeenCalled();
  });
  it('maps capacity independently of quotas for both public admission modes', async () => {
    vi.stubEnv('ASK_DISPATCH_SECRET', secret);
    const live = facade(),
      controller = new AskLiveController(live);
    live.create.mockRejectedValue(new AskLiveError('capacity'));
    live.createText.mockRejectedValue(new AskLiveError('capacity'));
    for (const mode of ['structured-price-v1', 'text-price-v1']) {
      const body =
        mode === 'structured-price-v1'
          ? create
          : { mode, threadId: null, placeId: null, query: 'Price 10, area 2 m2', locale: 'en' };
      const failure: unknown = await controller
        .create(body, req(`Bearer ${capability}`))
        .catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(HttpException);
      if (!(failure instanceof HttpException))
        throw new Error('Expected typed HTTP capacity refusal.');
      expect(failure.getStatus()).toBe(429);
      expect(failure.getResponse()).toEqual({ code: 'thread_pending_limit', limit: 3 });
    }
  });
  it('returns text acceptance or a strict 422 refusal after auth/config/key checks', async () => {
    vi.stubEnv('ASK_DISPATCH_SECRET', secret);
    const live = facade(),
      controller = new AskLiveController(live);
    const body = {
      mode: 'text-price-v1',
      threadId: null,
      placeId: null,
      query: 'Price 10, area 2 m2',
      locale: 'en',
    };
    expect(controller.textCapabilities(req()).available).toBe(true);
    expect(await controller.create(body, req(`Bearer ${capability}`))).toEqual({
      mode: 'text-price-v1',
      runId: identity.runId,
      threadId: identity.threadId,
      state: 'queued',
    });
    live.createText.mockResolvedValueOnce({ kind: 'refused', reason: 'missing_area' });
    const status = vi.fn();
    const response = { status, cookie: vi.fn() } as unknown as import('express').Response;
    expect(await controller.create(body, req(`Bearer ${capability}`), response)).toEqual({
      mode: 'text-price-v1',
      code: 'price_input_refused',
      reason: 'missing_area',
    });
    expect(status).toHaveBeenCalledWith(422);
    expect(live.create).not.toHaveBeenCalled();
    live.createText.mockClear();
    await expect(
      controller.create({ ...body, inputs }, req(`Bearer ${capability}`)),
    ).rejects.toThrow('Bad Request');
    await expect(controller.create(body, req('Bearer short'))).rejects.toThrow('Unauthorized');
    expect(live.createText).not.toHaveBeenCalled();
  });
  it('reports disabled availability and rejects creation before persistence when dispatch is absent', async () => {
    vi.stubEnv('ASK_DISPATCH_SECRET', '');
    const live = facade(),
      controller = new AskLiveController(live);
    expect(controller.capabilities(req())).toEqual({
      mode: 'structured-price-v1',
      available: false,
      intent: 'price_per_square_meter',
    });
    await expect(controller.create(create, req(`Bearer ${capability}`))).rejects.toThrow(
      'Service Unavailable',
    );
    expect(live.create).not.toHaveBeenCalled();
    await expect(controller.create(create, req('Bearer ask-fixture-v1-queued'))).rejects.toThrow(
      'Unauthorized',
    );
  });
  it('accepts only closed valid structured request after authority and forwards cancellable persistence', async () => {
    vi.stubEnv('ASK_DISPATCH_SECRET', secret);
    const live = facade(),
      controller = new AskLiveController(live);
    expect(controller.capabilities(req()).available).toBe(true);
    await expect(controller.create(create, req(`Bearer ${capability}`))).resolves.toEqual({
      mode: 'structured-price-v1',
      runId: identity.runId,
      threadId: identity.threadId,
      state: 'queued',
    });
    expect(live.create).toHaveBeenCalledWith(
      create,
      capability,
      'request-key-123456',
      { visitorDigest: expect.stringMatching(/^[0-9a-f]{64}$/) },
      expect.any(AbortSignal),
    );
    await expect(
      controller.create({ ...create, query: [] }, req(`Bearer ${capability}`)),
    ).rejects.toThrow('Bad Request');
    await expect(
      controller.create({ ...create, secret }, req(`Bearer ${capability}`)),
    ).rejects.toThrow('Bad Request');
  });
  it.each(['?unknown=value', '?mode=structured-price-v1', '?query=x&query=y'])(
    'rejects public query parameters %s before persistence',
    async (query) => {
      vi.stubEnv('ASK_DISPATCH_SECRET', secret);
      const live = facade(),
        controller = new AskLiveController(live);
      expect(() =>
        controller.capabilities(req(undefined, `/api/v1/ask/structured-capabilities${query}`)),
      ).toThrow('Bad Request');
      await expect(
        controller.create(create, req(`Bearer ${capability}`, `/api/v1/runs${query}`)),
      ).rejects.toThrow('Bad Request');
      expect(live.create).not.toHaveBeenCalled();
    },
  );
  it('admits only event-scoped HMAC dispatch and binds every path/body identity', async () => {
    vi.stubEnv('ASK_DISPATCH_SECRET', secret);
    const live = facade(),
      controller = new AskDispatchController(live),
      request = req(`Bearer ${askDispatchProof(secret, identity)}`);
    expect((await controller.claim(identity.runId, identity, request)).disposition).toBe('busy');
    await expect(controller.claim(identity.threadId, identity, request)).rejects.toThrow(
      'Forbidden',
    );
    await expect(
      controller.claim(identity.runId, identity, req(`Bearer ${capability}`)),
    ).rejects.toThrow('Forbidden');
    await expect(controller.claim(identity.runId, identity, req())).rejects.toThrow('Unauthorized');
    await expect(
      controller.claim(identity.runId, { ...identity, hidden: secret }, request),
    ).rejects.toThrow('Bad Request');
    await expect(
      controller.complete(
        identity.runId,
        { ...identity, executionId, evidence: null, failure: 'execution_unavailable' },
        request,
      ),
    ).resolves.toEqual(failed);
    await expect(
      controller.complete(
        identity.runId,
        { ...identity, executionId, evidence: null, failure: null },
        request,
      ),
    ).rejects.toThrow('Bad Request');
    vi.stubEnv('ASK_DISPATCH_SECRET', '');
    await expect(controller.claim(identity.runId, identity, request)).rejects.toThrow(
      'Service Unavailable',
    );
  });
  it('checks grant/path before Market callback and never calculates on foreign grant', async () => {
    const live = facade(),
      market = {
        extractPriceInputs: vi.fn(),
        pricePerSquareMeter: vi.fn().mockReturnValue({
          kind: 'price_per_square_meter',
          minorUnits: 50,
          currency: 'BRL',
          areaUnit: 'm2',
          inputs,
          computedAt: at,
        }),
      };
    const controller = new AskToolController(live, market),
      input = { ...identity, executionId, operation: 'price-per-square-meter', inputs };
    live.tool.mockRejectedValueOnce(new AskLiveError('forbidden'));
    await expect(
      controller.price(identity.runId, input, req(`Bearer ${capability}`)),
    ).rejects.toThrow('Forbidden');
    expect(market.pricePerSquareMeter).not.toHaveBeenCalled();
    live.tool.mockImplementation(async (_input, _grant, calculate) => ({
      ...input,
      receiptId: executionId,
      provenance: 'market-domain-v1',
      result: calculate(at),
    }));
    expect(
      (await controller.price(identity.runId, input, req(`Bearer ${capability}`))).result
        .minorUnits,
    ).toBe(50);
    expect(market.pricePerSquareMeter).toHaveBeenCalledWith(inputs, at);
    await expect(
      controller.price(identity.threadId, input, req(`Bearer ${capability}`)),
    ).rejects.toThrow('Bad Request');
    await expect(controller.price(identity.runId, input, req('Bearer short'))).rejects.toThrow(
      'Unauthorized',
    );
  });
  it.each([
    ['forbidden', 'Forbidden'],
    ['conflict', 'Conflict'],
    ['invalid', 'Bad Request'],
    ['unavailable', 'Service Unavailable'],
    ['busy', 'Service Unavailable'],
  ] as const)('sanitizes %s repository failures', async (kind, message) => {
    await expect(
      liveAuthorized(async () => {
        throw new AskLiveError(kind);
      }),
    ).rejects.toThrow(message);
  });
  it('does not reflect unexpected internal errors through business failure remapping', async () => {
    await expect(
      liveAuthorized(async () => {
        throw new TypeError('payload');
      }),
    ).rejects.toThrow('Bad Request');
    const failure = new Error('internal');
    await expect(
      liveAuthorized(async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
  });
});

it('maps each typed daily quota to its closed public 429 body', async () => {
  for (const scope of ['visitor', 'global'] as const) {
    const failure = await liveAuthorized(async () => {
      throw new AskQuotaError(scope, '2026-10-27T03:00:00.000Z');
    }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(HttpException);
    if (!(failure instanceof HttpException)) throw new Error('Expected quota exception.');
    expect(failure.getStatus()).toBe(429);
    expect(failure.getResponse()).toEqual({
      code: 'quota_exceeded',
      scope,
      reopensAt: '2026-10-27T03:00:00.000Z',
    });
  }
});

it('propagates one authenticated visitor digest through all five creation modes', async () => {
  vi.stubEnv('ASK_DISPATCH_SECRET', secret);
  const live = facade(),
    controller = new AskLiveController(live);
  live.createRouted.mockResolvedValue(queued);
  const cookie = vi.fn(),
    response = { cookie } as unknown as import('express').Response;
  let token = '';
  for (const mode of [
    'structured-price-v1',
    'text-price-v1',
    'text-price-explanation-v1',
    'routed-text-v1',
    'routed-text-explanation-v1',
  ]) {
    const request = req(`Bearer ${capability}`);
    if (token) request.headers.cookie = token;
    const candidate =
      mode === 'structured-price-v1'
        ? create
        : { mode, threadId: null, placeId: null, query: 'Price 10, area 2 m2', locale: 'en' };
    const result = await controller.create(candidate, request, response);
    expect(JSON.stringify(result)).not.toContain('visitor');
    if (!token) token = `${cookie.mock.calls[0]![0]}=${cookie.mock.calls[0]![1]}`;
  }
  expect(cookie).toHaveBeenCalledOnce();
  const admissions = [
    ...live.create.mock.calls,
    ...live.createText.mock.calls,
    ...live.createRouted.mock.calls,
  ].map((call) => call[3]);
  expect(admissions).toHaveLength(5);
  expect(new Set(admissions.map((admission: unknown) => JSON.stringify(admission))).size).toBe(1);
});
