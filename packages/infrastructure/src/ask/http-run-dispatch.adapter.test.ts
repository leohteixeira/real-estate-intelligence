import { describe, expect, it, vi } from 'vitest';
import { askDigest, askDispatchProof, equalAskDigest } from './ask-authority.js';
import { HttpRunDispatch } from './http-run-dispatch.adapter.js';
import { parseAskCompletion, parseAskLiveRun } from '@rei/contracts';
const identity = {
    version: 1 as const,
    eventId: '0199c8f2-2394-7ba0-8f9e-286378779212',
    runId: '0199c8f2-2394-7ba0-8f9e-286378779210',
    threadId: '0199c8f2-2394-7ba0-8f9e-286378779211',
  },
  secret = 's'.repeat(43);
const config = { baseUrl: 'http://api.internal:8200', secret };
const signal = () => new AbortController().signal;
describe('scoped one-attempt Ask dispatch transport', () => {
  it('admits maximum escaped query and slug in complete and terminal claim replay', async () => {
    const at = '2026-10-11T00:00:00.000Z',
      executionId = '0199c8f2-2394-7ba0-8f9e-286378779213';
    const inputs = { priceMinorUnits: 100, currency: 'BRL', areaSquareMeters: 2 };
    const result = {
      kind: 'price_per_square_meter',
      minorUnits: 50,
      currency: 'BRL',
      areaUnit: 'm2',
      inputs,
      computedAt: at,
    };
    const run = parseAskLiveRun({
      basis: 'structured-price-v1',
      id: identity.runId,
      threadId: identity.threadId,
      principalId: null,
      question: '\u0001'.repeat(16000),
      locale: 'en',
      placeId: 'a'.repeat(20000),
      createdAt: at,
      updatedAt: at,
      state: 'completed',
      originalInputs: inputs,
      decision: { source: 'fixed-structured-v1', intent: 'price_per_square_meter', decidedAt: at },
      result,
      terminal: { state: 'completed', reason: null, at },
      steps: [
        { sequence: 1, phase: 'calculating', at },
        { sequence: 2, phase: 'completed', at },
      ],
    });
    const completion = parseAskCompletion({
      ...identity,
      executionId,
      failure: null,
      evidence: {
        ...identity,
        executionId,
        step: 'structured-price-v1',
        outcome: 'price-calculated',
        visitedNodes: ['fixedDecision', 'priceTool'],
        receipt: {
          ...identity,
          executionId,
          receiptId: executionId,
          operation: 'price-per-square-meter',
          provenance: 'market-domain-v1',
          inputs,
          result,
        },
      },
    });
    for (const contentLength of [false, true]) {
      const terminal = { disposition: 'terminal', identity, run };
      const responses = [run, terminal].map((body) => {
        const json = JSON.stringify(body);
        expect(Buffer.byteLength(json)).toBeGreaterThan(100000);
        return new Response(json, {
          headers: {
            'content-type': 'application/json',
            ...(contentLength ? { 'content-length': String(Buffer.byteLength(json)) } : {}),
          },
        });
      });
      const transport = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(responses[0]!)
        .mockResolvedValueOnce(responses[1]!);
      const adapter = new HttpRunDispatch(config, transport);
      await expect(adapter.complete(completion, signal(), Date.now() + 1000)).resolves.toEqual(run);
      await expect(adapter.claim(identity, signal(), Date.now() + 1000)).resolves.toEqual(terminal);
      expect(transport).toHaveBeenCalledTimes(2);
    }
  });
  it.each([false, true])(
    'rejects over-limit response with content-length=%s in one attempt',
    async (contentLength) => {
      const payload = 'x'.repeat(128 * 1024 + 1);
      const transport = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(payload, {
          headers: {
            'content-type': 'application/json',
            ...(contentLength ? { 'content-length': String(Buffer.byteLength(payload)) } : {}),
          },
        }),
      );
      await expect(
        new HttpRunDispatch(config, transport).claim(identity, signal(), Date.now() + 1000),
      ).rejects.toMatchObject({ kind: 'rejected', operation: 'run-dispatch.claim' });
      expect(transport).toHaveBeenCalledOnce();
    },
  );
  it('sends only retained identity and exact scoped HMAC to the fixed API path', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ disposition: 'busy', identity, retryAfterMs: 100 }));
    const adapter = new HttpRunDispatch(config, transport);
    expect(await adapter.claim(identity, signal(), Date.now() + 1000)).toEqual({
      disposition: 'busy',
      identity,
      retryAfterMs: 100,
    });
    const [url, options] = transport.mock.calls[0]!;
    expect(url).toBe(`${config.baseUrl}/api/v1/internal/ask/runs/${identity.runId}/claim`);
    expect(options?.redirect).toBe('manual');
    expect(options?.headers).toMatchObject({
      authorization: `Bearer ${askDispatchProof(secret, identity)}`,
    });
    expect(options?.body).toBe(JSON.stringify(identity));
    expect(JSON.stringify(options?.body)).not.toContain(secret);
  });
  it('rejects identity substitution, hidden fields and malformed JSON without exposing transport payload', async () => {
    for (const response of [
      Response.json({
        disposition: 'busy',
        identity: { ...identity, eventId: identity.threadId },
        retryAfterMs: 1,
      }),
      Response.json({ disposition: 'busy', identity, retryAfterMs: 1, secret }),
      new Response(secret, { headers: { 'content-type': 'application/json' } }),
    ]) {
      const transport = vi.fn<typeof fetch>().mockResolvedValue(response),
        adapter = new HttpRunDispatch(config, transport);
      await expect(adapter.claim(identity, signal(), Date.now() + 1000)).rejects.toMatchObject({
        kind: 'rejected',
        operation: 'run-dispatch.claim',
      });
      expect(transport).toHaveBeenCalledOnce();
    }
  });
  it.each([302, 400, 403, 429, 500])(
    'classifies HTTP %s with no redirect or retry',
    async (status) => {
      const transport = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(secret, {
          status,
          headers: { 'content-type': 'application/json', location: 'http://attacker.invalid/' },
        }),
      );
      await expect(
        new HttpRunDispatch(config, transport).claim(identity, signal(), Date.now() + 1000),
      ).rejects.toMatchObject({ kind: status >= 500 || status === 429 ? 'transient' : 'rejected' });
      expect(transport).toHaveBeenCalledOnce();
    },
  );
  it('does not call fetch after cancellation or deadline and settles uncooperative transport', async () => {
    const transport = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => {})),
      adapter = new HttpRunDispatch(config, transport),
      controller = new AbortController();
    controller.abort();
    await expect(
      adapter.claim(identity, controller.signal, Date.now() + 100),
    ).rejects.toMatchObject({ kind: 'cancelled' });
    expect(transport).not.toHaveBeenCalled();
    await expect(adapter.claim(identity, signal(), Date.now() - 1)).rejects.toMatchObject({
      kind: 'transient',
    });
    expect(transport).not.toHaveBeenCalled();
    await expect(adapter.claim(identity, signal(), Date.now() + 10)).rejects.toMatchObject({
      kind: 'transient',
    });
  });
  it.each([
    'https://user:secret@api.internal/',
    'https://api.internal/path',
    'file:///tmp/tool',
    'https://api.internal/?target=other',
  ])('rejects unrestricted origin %s', (baseUrl) =>
    expect(() => new HttpRunDispatch({ baseUrl, secret })).toThrow(
      'Invalid Ask dispatch configuration.',
    ),
  );
  it('uses digest-only comparisons and binds proof to every identity field', () => {
    expect(askDigest(secret)).toMatch(/^[a-f0-9]{64}$/);
    expect(equalAskDigest(askDigest(secret), askDigest(secret))).toBe(true);
    expect(equalAskDigest('a', 'aa')).toBe(false);
    for (const changed of [
      { ...identity, eventId: identity.runId },
      { ...identity, runId: identity.threadId },
      { ...identity, threadId: identity.eventId },
    ])
      expect(askDispatchProof(secret, changed)).not.toBe(askDispatchProof(secret, identity));
  });
});
