import { parsePriceToolRequest, parsePriceToolReceipt } from '@rei/contracts';
import { describe, expect, it, vi } from 'vitest';
import { HttpPricePerSquareMeterTool } from './http-price-per-square-meter.tool';
import { ResilientPricePerSquareMeterTool } from './resilient-price-per-square-meter.tool';
import { InMemoryPricePerSquareMeterTool } from './in-memory-price-per-square-meter.tool';
const request = parsePriceToolRequest({
  version: 1,
  eventId: '0199c8f2-2394-7ba0-8f9e-286378779212',
  runId: '0199c8f2-2394-7ba0-8f9e-286378779210',
  threadId: '0199c8f2-2394-7ba0-8f9e-286378779211',
  executionId: '0199c8f2-2394-7ba0-8f9e-286378779213',
  operation: 'price-per-square-meter',
  inputs: { priceMinorUnits: 100, currency: 'BRL', areaSquareMeters: 2 },
});
const receipt = {
    ...request,
    receiptId: request.executionId,
    provenance: 'market-domain-v1',
    result: {
      kind: 'price_per_square_meter',
      minorUnits: 50,
      currency: 'BRL',
      areaUnit: 'm2',
      inputs: request.inputs,
      computedAt: '2026-10-11T00:00:00.000Z',
    },
  },
  grant = 'g'.repeat(43);
const signal = () => new AbortController().signal;
describe('typed fixed-origin backend price tool', () => {
  it('keeps test-only replay fake captures, returned receipts and source seeds isolated', async () => {
    const seed = parsePriceToolReceipt(structuredClone(receipt)),
      tool = new InMemoryPricePerSquareMeterTool(seed);
    const result = await tool.calculate(request, grant, signal(), Date.now() + 1000);
    Object.assign(result.result, { minorUnits: 1 });
    Object.assign(seed.result, { minorUnits: 2 });
    expect(
      (await tool.calculate(request, grant, signal(), Date.now() + 1000)).result.minorUnits,
    ).toBe(50);
    const captured = tool.requests;
    Object.assign(captured[0]!.inputs, { priceMinorUnits: 1 });
    expect(tool.requests[0]!.inputs.priceMinorUnits).toBe(100);
    await expect(
      new InMemoryPricePerSquareMeterTool(parsePriceToolReceipt(receipt), true).calculate(
        request,
        grant,
        signal(),
        Date.now() + 1000,
      ),
    ).rejects.toThrow('Price tool unavailable.');
  });
  it('passes only the ephemeral grant in authorization and validates retained receipt', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json(receipt));
    const tool = new HttpPricePerSquareMeterTool('http://api.internal:8200', transport);
    expect(await tool.calculate(request, grant, signal(), Date.now() + 1000)).toEqual(receipt);
    const [url, options] = transport.mock.calls[0]!;
    expect(url).toBe(
      `http://api.internal:8200/api/v1/ask/runs/${request.runId}/tools/price-per-square-meter`,
    );
    expect(options?.redirect).toBe('manual');
    expect(options?.headers).toEqual({
      'content-type': 'application/json',
      authorization: `Bearer ${grant}`,
    });
    expect(JSON.parse(String(options?.body))).toEqual(request);
    expect(String(options?.body)).not.toContain(grant);
  });
  it('rejects substitution, extra fields, redirects, oversized bodies and malformed JSON in one attempt', async () => {
    const responses = [
      Response.json({ ...receipt, eventId: request.runId }),
      Response.json({
        ...receipt,
        result: { ...receipt.result, inputs: { ...request.inputs, areaSquareMeters: 1 } },
      }),
      Response.json({ ...receipt, grant }),
      new Response('', { status: 302, headers: { location: 'https://attacker.invalid' } }),
      new Response('x'.repeat(17000), { headers: { 'content-type': 'application/json' } }),
      new Response(grant, { headers: { 'content-type': 'application/json' } }),
    ];
    for (const response of responses) {
      const transport = vi.fn<typeof fetch>().mockResolvedValue(response);
      await expect(
        new HttpPricePerSquareMeterTool('http://api.internal:8200', transport).calculate(
          request,
          grant,
          signal(),
          Date.now() + 1000,
        ),
      ).rejects.toThrow('Price tool unavailable.');
      expect(transport).toHaveBeenCalledOnce();
    }
  });
  it('rejects weak grant/cancellation without network work and bounds ignored AbortSignal', async () => {
    const transport = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => {})),
      tool = new HttpPricePerSquareMeterTool('http://api.internal:8200', transport),
      stop = new AbortController();
    stop.abort();
    for (const [capability, abort, deadline] of [
      [grant, stop.signal, Date.now() + 1000],
      ['short', signal(), Date.now() - 1],
      [grant, signal(), Date.now() - 1],
    ] as const)
      await expect(tool.calculate(request, capability, abort, deadline)).rejects.toThrow(
        'Price tool unavailable.',
      );
    expect(transport).not.toHaveBeenCalled();
    await expect(tool.calculate(request, grant, signal(), Date.now() + 10)).rejects.toThrow(
      'Price tool unavailable.',
    );
  });
  it.each(['https://user:password@api.internal', 'https://api.internal/path', 'file:///tmp/tool'])(
    'rejects non-root fixed origin %s',
    (origin) =>
      expect(() => new HttpPricePerSquareMeterTool(origin)).toThrow('Price tool unavailable.'),
  );
  it('keeps retries in named resilience and performs exactly one adapter attempt', async () => {
    const calculate = vi.fn().mockRejectedValue(new Error(grant)),
      tool = new ResilientPricePerSquareMeterTool({ calculate });
    await expect(tool.calculate(request, grant, signal(), Date.now() + 1000)).rejects.toThrow(
      'Price tool unavailable.',
    );
    expect(calculate).toHaveBeenCalledOnce();
  });
  it('preserves actual slow receipts while recording them toward breaker health', async () => {
    vi.useFakeTimers();
    try {
      const calculate = vi.fn().mockResolvedValue(parsePriceToolReceipt(receipt));
      let clock = 0;
      const tool = new ResilientPricePerSquareMeterTool({ calculate }, () => {
        clock += 2500;
        return clock;
      });
      for (let index = 0; index < 20; index++) {
        if (index === 10) await vi.advanceTimersByTimeAsync(1001);
        expect(await tool.calculate(request, grant, signal(), Date.now() + 10000)).toEqual(receipt);
      }
      await expect(tool.calculate(request, grant, signal(), Date.now() + 10000)).rejects.toThrow(
        'Price tool unavailable.',
      );
      expect(calculate).toHaveBeenCalledTimes(20);
    } finally {
      vi.useRealTimers();
    }
  });
  it('does not admit cancelled or expired work', async () => {
    const calculate = vi.fn(),
      tool = new ResilientPricePerSquareMeterTool({ calculate }),
      stop = new AbortController();
    stop.abort();
    await expect(tool.calculate(request, grant, stop.signal, Date.now() + 1000)).rejects.toThrow(
      'Price tool unavailable.',
    );
    await expect(tool.calculate(request, grant, signal(), Date.now() - 1)).rejects.toThrow(
      'Price tool unavailable.',
    );
    expect(calculate).not.toHaveBeenCalled();
  });
});
