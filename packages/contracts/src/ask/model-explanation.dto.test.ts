import { describe, expect, it } from 'vitest';
import {
  parseModelExplanation,
  parseModelExplanationRequest,
  parseModelExplanationResponse,
} from './model-explanation.dto.js';
import {
  parseExplainedAskCreate,
  parseTextAskCreate,
  parseStructuredAskCreate,
} from './ask-live.dto.js';

const identity = {
  version: 1 as const,
  eventId: '0199c8f2-2394-7ba0-8f9e-286378779210',
  runId: '0199c8f2-2394-7ba0-8f9e-286378779211',
  threadId: '0199c8f2-2394-7ba0-8f9e-286378779212',
};
const executionId = '0199c8f2-2394-7ba0-8f9e-286378779213';
const explanation = {
  ...identity,
  explanationId: executionId,
  toolReceiptId: executionId,
  reservationId: executionId,
  authorship: 'model-written',
  promptVersion: 'price-explanation-prompt-v1',
  grammarVersion: 'price-explanation-facts-v1',
  locale: 'en',
  text: 'Receipt-bound facts.',
  model: 'claude-haiku-5-5',
  route: 'anthropic-direct',
  privacyEvidenceId: null,
  outputTokens: 80,
  acceptedAt: '2026-10-11T00:00:00.000Z',
};
/** Retained before ADR 0029; production holds such rows, so they must keep parsing. */
const historical = {
  ...explanation,
  model: 'anthropic/claude-haiku-5.5',
  route: 'vercel-ai-gateway',
  privacyEvidenceId: 'privacy-evidence-identifier',
};
describe('closed model explanation transport', () => {
  it('keeps explained admission separate and enforces the unchanged input bound', () => {
    const request = {
      mode: 'text-price-explanation-v1',
      threadId: null,
      placeId: null,
      locale: 'en',
      query: 'Price BRL 785,000.00, area 68 m²',
    };
    expect(parseExplainedAskCreate(request)).toEqual(request);
    expect(() => parseTextAskCreate(request)).toThrow();
    expect(() => parseStructuredAskCreate(request)).toThrow();
    for (const changed of [
      { inputs: {} },
      { model: explanation.model },
      { history: [] },
      { query: 'x'.repeat(16001) },
      { locale: 'fr' },
    ])
      expect(() => parseExplainedAskCreate({ ...request, ...changed })).toThrow();
    expect(parseExplainedAskCreate({ ...request, query: 'x'.repeat(16000) }).query).toHaveLength(
      16000,
    );
  });
  it('parses each closed operation and response without accepting transport authority in the artifact', () => {
    const get = { ...identity, executionId, operation: 'get' };
    const reserve = {
      ...identity,
      executionId,
      operation: 'reserve',
      attemptKey: 'attempt-key-identifier',
      purpose: 'explanation',
      model: explanation.model,
      route: explanation.route,
      maxOutputTokens: 224,
    };
    const accept = { ...identity, executionId, operation: 'accept', explanation };
    for (const request of [get, reserve, accept])
      expect(parseModelExplanationRequest(request)).toEqual(request);
    const reservation = {
      reservationId: executionId,
      attemptKey: reserve.attemptKey,
      purpose: reserve.purpose,
      model: reserve.model,
      route: reserve.route,
      maxOutputTokens: 224,
      reservedTotal: 448,
    };
    for (const response of [
      { operation: 'get', explanation: null },
      { operation: 'get', explanation },
      { operation: 'reserve', reservation },
      { operation: 'accept', explanation },
    ])
      expect(parseModelExplanationResponse(response)).toEqual(response);
    for (const request of [get, reserve, accept])
      expect(() =>
        parseModelExplanationRequest({ ...request, grant: 'must-not-be-payload' }),
      ).toThrow();
    expect(() => parseModelExplanationRequest({ ...get, operation: 'unknown' })).toThrow();
    expect(() =>
      parseModelExplanationResponse({ operation: 'accept', explanation: null }),
    ).toThrow();
    expect(() =>
      parseModelExplanationResponse({
        operation: 'reserve',
        reservation: { ...reservation, reservedTotal: 1001 },
      }),
    ).toThrow();
    expect(() => parseModelExplanation({ ...explanation, executionId })).toThrow();
  });
  it.each([
    { model: 'claude-another-model' },
    { model: 'anthropic/claude-haiku-5.5' },
    { route: 'direct-anthropic' },
    { route: 'vercel-ai-gateway' },
    { privacyEvidenceId: 'privacy-evidence-identifier' },
    { authorship: 'template' },
    { promptVersion: 'unversioned' },
    { grammarVersion: 'unversioned' },
    { locale: 'fr' },
    { privacyEvidenceId: 'short' },
    { outputTokens: 0 },
    { outputTokens: 1001 },
    { outputTokens: 1.5 },
    { text: '' },
    { text: 'x'.repeat(2049) },
    { text: 'hidden\u0001control' },
    { text: 'line\nbreak' },
    { acceptedAt: 'invalid' },
    { runId: 'not-a-uuid' },
    { extra: true },
  ])('rejects malformed artifact field %j', (changed) => {
    expect(() => parseModelExplanation({ ...explanation, ...changed })).toThrow();
  });
  it('keeps retained gateway evidence readable without admitting any new gateway spend', () => {
    expect(parseModelExplanation(historical)).toEqual(historical);
    expect(
      parseModelExplanation({ ...historical, model: 'deepseek/deepseek-v4-flash-0731' }).model,
    ).toBe('deepseek/deepseek-v4-flash-0731');
    expect(parseModelExplanationResponse({ operation: 'get', explanation: historical })).toEqual({
      operation: 'get',
      explanation: historical,
    });
    for (const changed of [
      { privacyEvidenceId: null },
      { privacyEvidenceId: 'short' },
      { model: 'claude-haiku-5-5' },
      { model: 'deepseek/new-version' },
    ])
      expect(() => parseModelExplanation({ ...historical, ...changed })).toThrow();
    const reservation = {
      reservationId: executionId,
      attemptKey: 'attempt-key-identifier',
      model: historical.model,
      route: historical.route,
      maxOutputTokens: 16,
      reservedTotal: 16,
    };
    for (const purpose of ['privacy-probe', 'explanation'])
      expect(
        parseModelExplanationResponse({
          operation: 'reserve',
          reservation: { ...reservation, purpose },
        }),
      ).toEqual({ operation: 'reserve', reservation: { ...reservation, purpose } });
    expect(() =>
      parseModelExplanationResponse({
        operation: 'reserve',
        reservation: {
          ...reservation,
          purpose: 'privacy-probe',
          model: explanation.model,
          route: explanation.route,
        },
      }),
    ).toThrow();
    const reserve = {
      ...identity,
      executionId,
      operation: 'reserve',
      attemptKey: 'attempt-key-identifier',
      purpose: 'explanation',
      model: explanation.model,
      route: explanation.route,
      maxOutputTokens: 224,
    };
    expect(parseModelExplanationRequest(reserve)).toEqual(reserve);
    for (const changed of [
      { purpose: 'privacy-probe' },
      { model: historical.model, route: historical.route },
      { model: 'deepseek/deepseek-v4-flash-0731', route: historical.route },
      { route: historical.route },
      { model: 'claude-haiku-5-5-next' },
    ])
      expect(() => parseModelExplanationRequest({ ...reserve, ...changed })).toThrow();
  });
});
