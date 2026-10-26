import { describe, expect, it } from 'vitest';
import {
  askIntents,
  type RoutedAskLiveRun,
  type RoutedExplainedExecutionInput,
} from './intent-decision.types.js';
import {
  parseIntentDecision,
  parseIntentDecisionReceipt,
  parseIntentDecisionRequest,
  parseIntentDecisionResponse,
  parseRoutedAskCreate,
  parseRoutedExplainedAskCreate,
  parseRoutedExplainedAskAccepted,
  parseRoutedAskAccepted,
  parseRoutedAskConfirmation,
  parseRoutedAskLiveRun,
  parseRoutedExecutionEvidence,
  parseRoutedExecutionInput,
} from './intent-decision.dto.js';
const id = '0199c8f2-2394-7ba0-8f9e-286378779210',
  at = '2026-10-26T00:00:00.000Z';
const decision = {
  intent: 'price_per_square_meter',
  probability: 0.84,
  probabilities: Object.fromEntries(
    askIntents.map((label) => [label, label === 'price_per_square_meter' ? 0.84 : 0.032]),
  ),
  source: 'gateway-jev-v1',
  degraded: false,
  taxonomyVersion: 'ask-intents-v1',
  privacyEvidenceId: 'p'.repeat(24),
};
const retained = parseIntentDecisionReceipt({ ...decision, receiptId: id, acceptedAt: at });
const identity = { version: 1, eventId: id, runId: id, threadId: id, executionId: id };
const inputs = { priceMinorUnits: 78500000, currency: 'BRL' as const, areaSquareMeters: 68 };
const run: RoutedAskLiveRun = {
  basis: 'routed-text-v1',
  id,
  threadId: id,
  principalId: null,
  question: 'Calculate price per square meter.',
  locale: 'en',
  placeId: null,
  createdAt: at,
  updatedAt: at,
  state: 'awaiting_confirmation',
  originalInputs: inputs,
  decision: retained,
  confirmation: null,
  confirmationDeadline: '2026-10-26T00:10:00.000Z',
  result: null,
  terminal: null,
  steps: [
    { sequence: 1, phase: 'routing', at },
    { sequence: 2, phase: 'awaiting_confirmation', at },
  ],
};
describe('closed routed Ask wire contracts', () => {
  it('accepts only closed routed identity without issuing authority', () => {
    const accepted = { mode: 'routed-text-v1', runId: id, threadId: id, state: 'queued' };
    expect(parseRoutedAskAccepted(accepted)).toEqual(accepted);
    for (const invalid of [
      { ...accepted, capability: 'secret' },
      { ...accepted, runId: 'bad' },
      { ...accepted, state: 'running' },
      { ...accepted, mode: 'text-price-v1' },
    ])
      expect(() => parseRoutedAskAccepted(invalid)).toThrow();
  });
  it('keeps independent closed admission, confirmation and retained receipt shapes', () => {
    expect(
      parseRoutedAskCreate({
        mode: 'routed-text-v1',
        threadId: null,
        placeId: null,
        query: run.question,
        locale: 'en',
      }).query,
    ).toBe(run.question);
    expect(
      parseRoutedAskConfirmation({ runId: id, decisionReceiptId: id, inputs: null }).inputs,
    ).toBeNull();
    expect(parseIntentDecision(decision).probability).toBe(0.84);
    expect(parseRoutedAskLiveRun(run)).toEqual(run);
    for (const invalid of [
      { ...decision, probability: 0.85 },
      { ...decision, probabilities: { ...decision.probabilities, extra: 0 } },
      { ...decision, degraded: true },
      { ...decision, privacyEvidenceId: null },
    ])
      expect(() => parseIntentDecision(invalid)).toThrow();
    expect(() =>
      parseRoutedAskCreate({
        mode: 'routed-text-v1',
        threadId: null,
        placeId: null,
        query: 'bad\nquery',
        locale: 'en',
      }),
    ).toThrow();
  });
  it('rejects renewed deadlines, unauthorized terminal facts, invalid confirmation and step history', () => {
    for (const invalid of [
      { ...run, extra: true },
      { ...run, confirmationDeadline: '2026-10-26T00:11:00.000Z' },
      { ...run, decision: { ...retained, acceptedAt: '2026-10-25T00:00:00.000Z' } },
      { ...run, confirmation: { decisionReceiptId: id, inputs, at } },
      { ...run, steps: [{ sequence: 2, phase: 'routing', at }] },
      {
        ...run,
        state: 'cancelled',
        terminal: { state: 'cancelled', reason: 'confirmation_expired', at },
      },
      { ...run, state: 'completed', result: null },
    ])
      expect(() => parseRoutedAskLiveRun(invalid)).toThrow();
  });
  it.each(askIntents.filter((intent) => intent !== 'price_per_square_meter'))(
    'accepts only the retained, gate-authorized unavailable result for %s',
    (intent) => {
      const receipt = (probability: number) =>
        parseIntentDecisionReceipt({
          ...decision,
          intent,
          probability,
          probabilities: Object.fromEntries(
            askIntents.map((label) => [
              label,
              label === intent ? probability : (1 - probability) / 5,
            ]),
          ),
          receiptId: id,
          acceptedAt: at,
        });
      const result = { kind: 'unavailable_intent', intent, reason: 'not_available' };
      const completed = {
        ...run,
        state: 'completed',
        originalInputs: null,
        decision: receipt(0.85),
        confirmationDeadline: null,
        result,
        terminal: { state: 'completed', reason: null, at },
        steps: [
          { sequence: 1, phase: 'routing', at },
          { sequence: 2, phase: 'completed', at },
        ],
      };
      expect(parseRoutedAskLiveRun(completed)).toEqual(completed);
      const confirmed = {
        ...completed,
        decision: receipt(0.84),
        confirmationDeadline: run.confirmationDeadline,
        confirmation: { decisionReceiptId: id, inputs: null, at },
        steps: [
          ...run.steps,
          { sequence: 3, phase: 'confirmed', at },
          { sequence: 4, phase: 'completed', at },
        ],
      };
      expect(parseRoutedAskLiveRun(confirmed)).toEqual(confirmed);
      for (const invalid of [
        { ...completed, decision: null },
        { ...completed, decision: receipt(0.84) },
        { ...completed, decision: retained },
        {
          ...confirmed,
          confirmation: {
            decisionReceiptId: '0199c8f2-2394-7ba0-8f9e-286378779211',
            inputs: null,
            at,
          },
        },
        { ...completed, result: { ...result, intent: 'price_per_square_meter' } },
        { ...completed, result: { ...result, intent: 'invented' } },
        {
          ...completed,
          result: { ...result, intent: intent === 'unsupported' ? 'comparables' : 'unsupported' },
        },
        { ...completed, result: { ...result, reason: 'execution_unavailable' } },
        { ...completed, result: { ...result, explanation: 'generated text' } },
        { ...completed, result: { kind: 'unavailable_intent', intent } },
        { ...completed, terminal: { state: 'completed', reason: 'execution_unavailable', at } },
        {
          ...completed,
          state: 'failed',
          terminal: { state: 'failed', reason: 'execution_unavailable', at },
        },
      ])
        expect(() => parseRoutedAskLiveRun(invalid)).toThrow();
    },
  );
  it('retains exact receipt identity across get, reserve and accept', () => {
    for (const request of [
      { ...identity, operation: 'get' },
      { ...identity, operation: 'reserve', attemptKey: 'a'.repeat(32) },
      { ...identity, operation: 'accept', reservationId: id, decision },
    ])
      expect(parseIntentDecisionRequest(request)).toEqual(request);
    for (const response of [
      { operation: 'get', decision: retained, confirmation: null },
      { operation: 'reserve', reservationId: id },
      { operation: 'accept', decision: retained },
    ])
      expect(parseIntentDecisionResponse(response)).toEqual(response);
    expect(() => parseIntentDecisionRequest({ ...identity, operation: 'delete' })).toThrow();
    expect(() => parseIntentDecisionResponse({ operation: 'accept', decision })).toThrow();
  });
  it('represents pause/unavailable without inventing a price receipt', () => {
    const input = {
      ...identity,
      step: 'routed-text-v1',
      query: run.question,
      locale: 'en',
      toolGrant: 'g'.repeat(43),
      checkpointGrant: 'c'.repeat(43),
      inputs: null,
    };
    expect(parseRoutedExecutionInput(input)).toEqual(input);
    for (const outcome of ['awaiting-confirmation', 'execution-unavailable']) {
      const evidence = { ...identity, step: 'routed-text-v1', decisionReceiptId: id, outcome };
      expect(parseRoutedExecutionEvidence(evidence)).toEqual(evidence);
      expect(() => parseRoutedExecutionEvidence({ ...evidence, receipt: null })).toThrow();
    }
    expect(() =>
      parseRoutedExecutionEvidence({
        ...identity,
        step: 'routed-text-v1',
        decisionReceiptId: id,
        outcome: 'price-calculated',
      }),
    ).toThrow();
  });
});

describe('closed combined routing and explanation contracts', () => {
  const mode = 'routed-text-explanation-v1';
  const explanation = {
    version: 1,
    eventId: id,
    runId: id,
    threadId: id,
    explanationId: id,
    toolReceiptId: id,
    reservationId: id,
    authorship: 'model-written',
    promptVersion: 'price-explanation-prompt-v1',
    grammarVersion: 'price-explanation-facts-v1',
    locale: 'en',
    text: 'Receipt-bound facts.',
    model: 'anthropic/claude-haiku-5.5',
    route: 'vercel-ai-gateway',
    privacyEvidenceId: 'p'.repeat(24),
    outputTokens: 64,
    acceptedAt: at,
  };
  it('admits only the explicit new closed mode and preserves historical admission', () => {
    const create = { mode, threadId: null, placeId: null, query: run.question, locale: 'en' };
    expect(parseRoutedExplainedAskCreate(create)).toEqual(create);
    expect(() => parseRoutedAskCreate(create)).toThrow();
    expect(() => parseRoutedExplainedAskCreate({ ...create, mode: 'routed-text-v1' })).toThrow();
    expect(() => parseRoutedExplainedAskCreate({ ...create, inputs })).toThrow();
    const accepted = { mode, runId: id, threadId: id, state: 'queued' };
    expect(parseRoutedExplainedAskAccepted(accepted)).toEqual(accepted);
    expect(() => parseRoutedAskAccepted(accepted)).toThrow();
    expect(() => parseRoutedExplainedAskAccepted({ ...accepted, grant: 'secret' })).toThrow();
  });
  it('requires bounded attempt queue timing and admission time only in the combined execution partition and forbids model evidence on nonprice outcomes', () => {
    const input = {
      ...identity,
      version: 1,
      step: mode,
      query: run.question,
      locale: 'en',
      toolGrant: 'g'.repeat(43),
      checkpointGrant: 'c'.repeat(43),
      inputs,
      admittedAt: at,
      queueDurationMs: 17,
    } satisfies RoutedExplainedExecutionInput;
    expect(parseRoutedExecutionInput(input)).toEqual(input);
    const { admittedAt, ...missing } = input;
    expect(admittedAt).toBe(at);
    expect(() => parseRoutedExecutionInput(missing)).toThrow();
    const { queueDurationMs, ...missingQueue } = input;
    expect(queueDurationMs).toBe(17);
    expect(() => parseRoutedExecutionInput(missingQueue)).toThrow();
    for (const queueDurationMs of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '17'])
      expect(() => parseRoutedExecutionInput({ ...input, queueDurationMs })).toThrow();
    for (const queueDurationMs of [0, Number.MAX_SAFE_INTEGER])
      expect(parseRoutedExecutionInput({ ...input, queueDurationMs })).toMatchObject({
        queueDurationMs,
      });
    expect(() => parseRoutedExecutionInput({ ...input, step: 'routed-text-v1' })).toThrow();
    for (const outcome of ['awaiting-confirmation', 'execution-unavailable']) {
      const evidence = { ...identity, step: mode, outcome, decisionReceiptId: id };
      expect(parseRoutedExecutionEvidence(evidence)).toEqual(evidence);
      expect(() => parseRoutedExecutionEvidence({ ...evidence, explanation })).toThrow();
    }
  });
  it('requires a model artifact only for completed combined prices, with matching identity and locale', () => {
    const result = {
      kind: 'price_per_square_meter',
      minorUnits: 1154412,
      currency: 'BRL',
      areaUnit: 'm2',
      inputs,
      computedAt: at,
    };
    const completed = {
      ...run,
      basis: mode,
      decision: {
        ...retained,
        probability: 0.85,
        probabilities: Object.fromEntries(
          askIntents.map((label) => [label, label === 'price_per_square_meter' ? 0.85 : 0.03]),
        ),
      },
      state: 'completed',
      confirmationDeadline: null,
      result,
      explanation,
      terminal: { state: 'completed', reason: null, at },
      steps: [
        { sequence: 1, phase: 'routing', at },
        { sequence: 2, phase: 'completed', at },
      ],
    };
    expect(parseRoutedAskLiveRun({ ...run, basis: mode, explanation: null })).toMatchObject({
      explanation: null,
    });
    // Price shape is validated by the same historical parser before explanation validation.
    const historical = { ...completed, basis: 'routed-text-v1' };
    const { explanation: historicalExplanation, ...historicalRun } = historical;
    expect(historicalExplanation).toBe(explanation);
    const historicalResult = parseRoutedAskLiveRun(historicalRun);
    expect(parseRoutedAskLiveRun(completed)).toMatchObject({
      result: historicalResult.result,
      explanation,
    });
    for (const changed of [
      null,
      { ...explanation, runId: '0199c8f2-2394-7ba0-8f9e-286378779211' },
      { ...explanation, locale: 'pt-BR' },
    ])
      expect(() => parseRoutedAskLiveRun({ ...completed, explanation: changed })).toThrow();
    expect(() => parseRoutedAskLiveRun({ ...run, basis: mode, explanation })).toThrow();
  });
});
