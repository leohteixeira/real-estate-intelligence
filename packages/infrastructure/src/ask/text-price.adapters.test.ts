import { describe, expect, it, vi } from 'vitest';
import {
  parseAskLiveRun,
  parseTextExecutionRequest,
  parseTextExecutionEvidence,
} from '@rei/contracts';
import { HttpRunExecutor } from './http-run-executor.adapter.js';
import { HttpRunDispatch } from './http-run-dispatch.adapter.js';
import { InMemoryRunExecutor } from './in-memory-run-executor.adapter.js';
import { InMemoryRunDispatch } from './in-memory-run-dispatch.adapter.js';

const identity = {
  version: 1 as const,
  eventId: '0199c8f2-2394-7ba0-8f9e-286378779212',
  runId: '0199c8f2-2394-7ba0-8f9e-286378779210',
  threadId: '0199c8f2-2394-7ba0-8f9e-286378779211',
};
const executionId = '0199c8f2-2394-7ba0-8f9e-286378779213',
  at = '2026-10-11T00:00:00.000Z';
const input = parseTextExecutionRequest({
  ...identity,
  executionId,
  step: 'text-price-v1',
  query: 'Price BRL 785000, area 68 m2',
  locale: 'en',
  toolGrant: 'g'.repeat(43),
  inputs: { priceMinorUnits: 78500000, currency: 'BRL', areaSquareMeters: 68 },
});
const result = {
  kind: 'price_per_square_meter',
  minorUnits: 1154412,
  currency: 'BRL',
  areaUnit: 'm2',
  inputs: input.inputs,
  computedAt: at,
};
const evidence = parseTextExecutionEvidence({
  ...identity,
  executionId,
  step: input.step,
  outcome: 'price-calculated',
  visitedNodes: ['validatedInputs', 'priceTool'],
  receipt: {
    ...identity,
    executionId,
    operation: 'price-per-square-meter',
    inputs: input.inputs,
    receiptId: executionId,
    provenance: 'market-domain-v1',
    result,
  },
});
const terminal = parseAskLiveRun({
  basis: 'text-price-v1',
  id: identity.runId,
  threadId: identity.threadId,
  principalId: null,
  question: input.query,
  locale: input.locale,
  placeId: null,
  createdAt: at,
  updatedAt: at,
  state: 'completed',
  originalInputs: input.inputs,
  decision: { source: 'validated-text-v1', intent: 'price_per_square_meter', decidedAt: at },
  result,
  terminal: { state: 'completed', reason: null, at },
  steps: [
    { sequence: 1, phase: 'calculating', at },
    { sequence: 2, phase: 'completed', at },
  ],
});
const claim = { disposition: 'claimed' as const, identity, input, expiresAt: at };
const completion = { ...identity, executionId, evidence, failure: null };
const signal = () => new AbortController().signal;

describe('closed text price HTTP and in-memory ports', () => {
  it('roundtrips text evidence in one fixed-destination attempt and correlates all retained fields', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(evidence));
    const adapter = new HttpRunExecutor(
      { baseUrl: 'http://ai.test', token: 't'.repeat(43) },
      transport,
    );
    expect(await adapter.execute(input, signal(), Date.now() + 1000)).toEqual(evidence);
    expect(transport).toHaveBeenCalledOnce();
    for (const changed of [
      { ...evidence, eventId: executionId, receipt: { ...evidence.receipt, eventId: executionId } },
      {
        ...evidence,
        executionId: identity.eventId,
        receipt: { ...evidence.receipt, executionId: identity.eventId },
      },
      {
        ...evidence,
        receipt: {
          ...evidence.receipt,
          inputs: { ...input.inputs, priceMinorUnits: 1 },
          result: { ...evidence.receipt.result, inputs: { ...input.inputs, priceMinorUnits: 1 } },
        },
      },
      { ...evidence, step: 'structured-price-v1', visitedNodes: ['fixedDecision', 'priceTool'] },
    ]) {
      transport.mockResolvedValueOnce(Response.json(changed));
      await expect(adapter.execute(input, signal(), Date.now() + 1000)).rejects.toMatchObject({
        kind: 'rejected',
      });
    }
  });
  it('dispatches text claims and completion to fixed API paths with scoped authority', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(claim))
      .mockResolvedValueOnce(Response.json(terminal));
    const adapter = new HttpRunDispatch(
      { baseUrl: 'http://api.test', secret: 's'.repeat(43) },
      transport,
    );
    expect(await adapter.claim(identity, signal(), Date.now() + 1000)).toEqual(claim);
    expect(await adapter.complete(completion, signal(), Date.now() + 1000)).toEqual(terminal);
    expect(transport).toHaveBeenCalledTimes(2);
    transport.mockResolvedValueOnce(
      Response.json({
        ...terminal,
        basis: 'structured-price-v1',
        decision: { ...terminal.decision, source: 'fixed-structured-v1' },
      }),
    );
    await expect(adapter.complete(completion, signal(), Date.now() + 1000)).rejects.toMatchObject({
      kind: 'rejected',
    });
  });
  it('keeps fake receipt authority, cancellation and defensive copying truthful', async () => {
    const executor = new InMemoryRunExecutor(undefined, evidence.receipt);
    expect(await executor.execute(input, signal(), Date.now() + 1000)).toEqual(evidence);
    const returned = await executor.execute(input, signal(), Date.now() + 1000);
    Reflect.set(returned.visitedNodes, '0', 'mutated');
    expect((await executor.execute(input, signal(), Date.now() + 1000)).visitedNodes).toEqual([
      'validatedInputs',
      'priceTool',
    ]);
    await expect(
      executor.execute(
        { ...input, inputs: { ...input.inputs, priceMinorUnits: 1 } },
        signal(),
        Date.now() + 1000,
      ),
    ).rejects.toMatchObject({ kind: 'rejected' });
    await expect(
      executor.execute(input, AbortSignal.abort(), Date.now() + 1000),
    ).rejects.toMatchObject({ kind: 'cancelled' });
    await expect(
      new InMemoryRunExecutor().execute(input, signal(), Date.now() + 1000),
    ).rejects.toMatchObject({ kind: 'rejected' });
    const dispatch = new InMemoryRunDispatch([claim], terminal);
    expect(await dispatch.claim(identity, signal(), Date.now() + 1000)).toEqual(claim);
    expect(await dispatch.complete(completion, signal(), Date.now() + 1000)).toEqual(terminal);
    expect(dispatch.completions).toEqual([completion]);
    await expect(
      dispatch.claim(identity, AbortSignal.abort(), Date.now() + 1000),
    ).rejects.toMatchObject({ kind: 'cancelled' });
  });
});
