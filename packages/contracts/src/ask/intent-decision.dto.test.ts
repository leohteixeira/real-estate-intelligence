import { describe, expect, it } from 'vitest';
import { askIntents, type RoutedAskLiveRun } from './intent-decision.types.js';
import {
  parseIntentDecision,
  parseIntentDecisionReceipt,
  parseIntentDecisionRequest,
  parseIntentDecisionResponse,
  parseRoutedAskCreate,
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
