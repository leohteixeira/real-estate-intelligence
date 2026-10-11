import { EventEmitter } from 'node:events';
import type { Request } from 'express';
import { AskLiveError } from '@rei/application';
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
    const response = { status } as unknown as import('express').Response;
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
