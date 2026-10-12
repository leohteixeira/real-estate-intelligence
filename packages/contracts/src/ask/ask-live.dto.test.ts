import { describe, expect, it } from 'vitest';
import {
  parseAskClaim,
  parseAskCompletion,
  parseAskLiveEvent,
  parseAskLiveRun,
  parseAskLiveThread,
  parsePriceToolReceipt,
  parseStructuredAskAccepted,
  parseStructuredAskCreate,
  parseStructuredExecutionEvidence,
  parseStructuredExecutionRequest,
  parseTextAskCreate,
  parseTextAskAccepted,
  parseTextAskRefused,
  parseTextExecutionRequest,
  parseTextExecutionEvidence,
} from './ask-live.dto.js';
const runId = '0199c8f2-2394-7ba0-8f9e-286378779210',
  threadId = '0199c8f2-2394-7ba0-8f9e-286378779211',
  eventId = '0199c8f2-2394-7ba0-8f9e-286378779212',
  executionId = '0199c8f2-2394-7ba0-8f9e-286378779213';
const identity = { version: 1 as const, runId, threadId, eventId };
const inputs = { priceMinorUnits: 10000000, currency: 'BRL' as const, areaSquareMeters: 25 };
const at = '2026-10-11T00:00:00.000Z';
const queued = {
  basis: 'structured-price-v1',
  id: runId,
  threadId,
  principalId: null,
  question: 'Calculate price.',
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
};
const running = {
  ...queued,
  state: 'running',
  decision: { source: 'fixed-structured-v1', intent: 'price_per_square_meter', decidedAt: at },
  steps: [{ sequence: 1, phase: 'calculating', at }],
};
const result = {
  kind: 'price_per_square_meter',
  minorUnits: 400000,
  currency: 'BRL',
  areaUnit: 'm2',
  inputs,
  computedAt: at,
};
const receipt = {
  ...identity,
  executionId,
  operation: 'price-per-square-meter',
  inputs,
  receiptId: executionId,
  provenance: 'market-domain-v1',
  result,
};
const evidence = {
  ...identity,
  executionId,
  step: 'structured-price-v1',
  outcome: 'price-calculated',
  visitedNodes: ['fixedDecision', 'priceTool'],
  receipt,
};
const completed = {
  ...running,
  state: 'completed',
  result,
  terminal: { state: 'completed', reason: null, at },
  steps: [...running.steps, { sequence: 2, phase: 'completed', at }],
};
describe('structured Ask closed wire contracts', () => {
  it('admits only closed text creation, acceptance and finite non-echoing refusals', () => {
    const body = {
      mode: 'text-price-v1',
      threadId: null,
      placeId: null,
      query: 'Price 10, area 2 m2',
      locale: 'en',
    };
    expect(parseTextAskCreate(body)).toEqual(body);
    expect(parseTextAskAccepted({ mode: body.mode, runId, threadId, state: 'queued' }).runId).toBe(
      runId,
    );
    expect(
      parseTextAskRefused({ mode: body.mode, code: 'price_input_refused', reason: 'missing_area' })
        .reason,
    ).toBe('missing_area');
    for (const bad of [
      { ...body, inputs },
      { ...body, secret: 'x' },
      { ...body, locale: 'fr' },
      { ...body, query: '\u0001' },
      { ...body, query: 'x'.repeat(16001) },
    ])
      expect(() => parseTextAskCreate(bad)).toThrow();
    expect(() => parseStructuredAskCreate(body)).toThrow();
    expect(() =>
      parseTextAskRefused({ mode: body.mode, code: 'price_input_refused', reason: 'arbitrary' }),
    ).toThrow();
    expect(() =>
      parseTextAskRefused({
        mode: body.mode,
        code: 'price_input_refused',
        reason: 'missing_area',
        query: body.query,
      }),
    ).toThrow();
  });
  it('correlates text basis, decision, actual graph nodes and mixed thread basis', () => {
    const textRun = {
      ...completed,
      basis: 'text-price-v1',
      decision: { ...running.decision, source: 'validated-text-v1' },
    };
    expect(parseAskLiveRun(textRun).basis).toBe('text-price-v1');
    expect(() => parseAskLiveRun({ ...textRun, decision: running.decision })).toThrow();
    expect(() => parseAskLiveRun({ ...completed, decision: textRun.decision })).toThrow();
    const other = { ...textRun, id: executionId };
    expect(
      parseAskLiveThread({
        basis: 'mixed-price-v1',
        id: threadId,
        principalId: null,
        runs: [completed, other],
      }).runs,
    ).toHaveLength(2);
    expect(() =>
      parseAskLiveThread({
        basis: 'text-price-v1',
        id: threadId,
        principalId: null,
        runs: [completed, other],
      }),
    ).toThrow();
    const input = {
      ...identity,
      executionId,
      step: 'text-price-v1',
      query: 'Price 100000, area 25 m2',
      locale: 'en',
      toolGrant: 'g'.repeat(43),
      checkpointGrant: 'c'.repeat(43),
      inputs,
    };
    expect(parseTextExecutionRequest(input).step).toBe('text-price-v1');
    expect(
      parseAskClaim({ disposition: 'claimed', identity, input, expiresAt: at }).disposition,
    ).toBe('claimed');
    const textEvidence = {
      ...evidence,
      step: 'text-price-v1',
      visitedNodes: ['validatedInputs', 'priceTool'],
    };
    expect(parseTextExecutionEvidence(textEvidence).visitedNodes).toEqual([
      'validatedInputs',
      'priceTool',
    ]);
    expect(
      parseAskCompletion({ ...identity, executionId, evidence: textEvidence, failure: null })
        .evidence?.step,
    ).toBe('text-price-v1');
    for (const changed of [
      { ...textEvidence, visitedNodes: evidence.visitedNodes },
      { ...textEvidence, receipt: { ...receipt, eventId: executionId } },
      { ...textEvidence, receipt: { ...receipt, executionId: eventId } },
      { ...textEvidence, receipt: { ...receipt, inputs: { ...inputs, priceMinorUnits: 1 } } },
      { ...textEvidence, extra: 1 },
    ])
      expect(() => parseTextExecutionEvidence(changed)).toThrow();
    expect(() => parseStructuredExecutionRequest(input)).toThrow();
    expect(() => parseStructuredExecutionEvidence(textEvidence)).toThrow();
  });
  it('accepts independently parsed queued/running/terminal documents, thread and cursor', () => {
    for (const run of [queued, running, completed]) expect(parseAskLiveRun(run).id).toBe(runId);
    expect(
      parseAskLiveThread({
        basis: 'structured-price-v1',
        id: threadId,
        principalId: null,
        runs: [completed],
      }).runs,
    ).toHaveLength(1);
    expect(
      parseAskLiveEvent({
        version: 1,
        id: `${runId}:v1:3`,
        runId,
        sequence: 3,
        event: 'ask.completed',
        terminal: true,
        run: completed,
      }).terminal,
    ).toBe(true);
    expect(
      parseStructuredAskAccepted({ mode: 'structured-price-v1', runId, threadId, state: 'queued' })
        .runId,
    ).toBe(runId);
  });
  it('accepts the exact fixed graph/tool/dispatch chain', () => {
    const input = {
      ...identity,
      executionId,
      step: 'structured-price-v1',
      query: 'Calculate price.',
      locale: 'en',
      toolGrant: 'g'.repeat(43),
      checkpointGrant: 'c'.repeat(43),
      inputs,
    };
    expect(parseStructuredExecutionRequest(input).inputs).toEqual(inputs);
    expect(parsePriceToolReceipt(receipt).result.minorUnits).toBe(400000);
    expect(parseStructuredExecutionEvidence(evidence).visitedNodes).toEqual([
      'fixedDecision',
      'priceTool',
    ]);
    expect(
      parseAskClaim({ disposition: 'claimed', identity, input, expiresAt: at }).disposition,
    ).toBe('claimed');
    expect(parseAskClaim({ disposition: 'busy', identity, retryAfterMs: 30000 }).disposition).toBe(
      'busy',
    );
    expect(parseAskClaim({ disposition: 'terminal', identity, run: completed }).disposition).toBe(
      'terminal',
    );
    expect(
      parseAskCompletion({ ...identity, executionId, evidence, failure: null }).failure,
    ).toBeNull();
    expect(
      parseAskCompletion({
        ...identity,
        executionId,
        evidence: null,
        failure: 'execution_unavailable',
      }).evidence,
    ).toBeNull();
  });
  it.each([0, -1, Number.MAX_SAFE_INTEGER + 1, 1.1, Infinity, NaN])(
    'rejects invalid integer money %s',
    (priceMinorUnits) => {
      expect(() =>
        parseStructuredAskCreate({
          mode: 'structured-price-v1',
          threadId: null,
          placeId: null,
          query: 'Calculate price.',
          locale: 'en',
          inputs: { ...inputs, priceMinorUnits },
        }),
      ).toThrow();
    },
  );
  it.each([0, -1, Infinity, NaN, 1000001, 1e-100])(
    'rejects invalid or unsafe area %s',
    (areaSquareMeters) => {
      expect(() =>
        parseStructuredAskCreate({
          mode: 'structured-price-v1',
          threadId: null,
          placeId: null,
          query: 'Calculate price.',
          locale: 'en',
          inputs: { ...inputs, areaSquareMeters },
        }),
      ).toThrow();
    },
  );
  it('rejects hidden fields recursively, substituted correlation, receipt inputs and impossible history', () => {
    for (const changed of [
      { ...queued, secret: 'hidden' },
      { ...running, steps: [...running.steps, ...running.steps] },
      { ...completed, terminal: { ...completed.terminal, reason: 'execution_unavailable' } },
      { ...completed, result: { ...result, inputs: { ...inputs, priceMinorUnits: 1 } } },
      { ...queued, principalId: runId },
    ])
      expect(() => parseAskLiveRun(changed)).toThrow();
    expect(() =>
      parseStructuredExecutionEvidence({
        ...evidence,
        visitedNodes: ['priceTool', 'fixedDecision'],
      }),
    ).toThrow();
    expect(() =>
      parseStructuredExecutionEvidence({
        ...evidence,
        receipt: { ...receipt, eventId: executionId },
      }),
    ).toThrow();
    expect(() =>
      parsePriceToolReceipt({
        ...receipt,
        result: { ...result, inputs: { ...inputs, areaSquareMeters: 1 } },
      }),
    ).toThrow();
    expect(() =>
      parseAskCompletion({ ...identity, executionId, evidence, failure: 'execution_unavailable' }),
    ).toThrow();
    expect(() => parseAskClaim({ disposition: 'busy', identity, retryAfterMs: 30001 })).toThrow();
    expect(() =>
      parseAskLiveThread({
        basis: 'structured-price-v1',
        id: runId,
        principalId: null,
        runs: [queued],
      }),
    ).toThrow();
    expect(() =>
      parseAskLiveEvent({
        version: 1,
        id: `${runId}:v1:4`,
        runId,
        sequence: 3,
        event: 'ask.completed',
        terminal: true,
        run: completed,
      }),
    ).toThrow();
  });
});
