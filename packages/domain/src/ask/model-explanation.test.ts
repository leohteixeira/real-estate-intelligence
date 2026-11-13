import { describe, expect, it } from 'vitest';
import {
  priceExplanationFactsV1,
  priceExplanationReceiptV1 as receipt,
} from './fixtures/price-explanation-facts-v1.js';
import {
  explanationFacts,
  validExplanationText,
  validModelExplanation,
  sameModelExplanation,
  type ModelExplanation,
} from './model-explanation.js';

describe('price-explanation-facts-v1 offline PT/EN fidelity dataset', () => {
  for (const locale of ['en', 'pt-BR'] as const) {
    it.each(priceExplanationFactsV1(locale))(
      '$id: fidelity matches the labeled outcome',
      (fixture) => {
        expect(validExplanationText(fixture.text, receipt, locale)).toBe(fixture.accepted);
      },
    );
    it(`retains exact localized rounding (${locale})`, () => {
      expect(explanationFacts(receipt, locale)[2]).toContain(
        locale === 'en' ? 'BRL 11,544.12/m²' : 'BRL 11.544,12/m²',
      );
    });
  }
  it('binds accepted evidence to immutable run, locale and receipt, not execution or JSON key order', () => {
    const explanation: ModelExplanation = {
      version: 1,
      eventId: receipt.eventId,
      runId: receipt.runId,
      threadId: receipt.threadId,
      explanationId: receipt.receiptId,
      toolReceiptId: receipt.receiptId,
      reservationId: receipt.receiptId,
      authorship: 'model-written',
      promptVersion: 'price-explanation-prompt-v1',
      grammarVersion: 'price-explanation-facts-v1',
      locale: 'en',
      text: explanationFacts(receipt, 'en').join(' '),
      model: 'claude-haiku-5-5',
      route: 'anthropic-direct',
      privacyEvidenceId: null,
      outputTokens: 50,
      acceptedAt: receipt.result.computedAt,
    };
    // Retained before ADR 0029: a gateway record keeps its evidence identifier.
    const historical: ModelExplanation = {
      ...explanation,
      model: 'anthropic/claude-haiku-5.5',
      route: 'vercel-ai-gateway',
      privacyEvidenceId: 'p'.repeat(32),
    };
    expect(validModelExplanation(historical, receipt, 'en')).toBe(true);
    expect(validModelExplanation({ ...historical, privacyEvidenceId: null }, receipt, 'en')).toBe(
      false,
    );
    expect(
      validModelExplanation({ ...explanation, privacyEvidenceId: 'p'.repeat(32) }, receipt, 'en'),
    ).toBe(false);
    expect(
      validModelExplanation(explanation, { ...receipt, executionId: receipt.runId }, 'en'),
    ).toBe(true);
    for (const invalid of [
      { ...explanation, runId: receipt.threadId },
      { ...explanation, threadId: receipt.runId },
      { ...explanation, eventId: receipt.runId },
      { ...explanation, toolReceiptId: receipt.runId },
      { ...explanation, outputTokens: 0 },
      { ...explanation, outputTokens: 1001 },
      { ...explanation, text: `${explanation.text} Cheap.` },
    ])
      expect(validModelExplanation(invalid, receipt, 'en')).toBe(false);
    expect(validModelExplanation(explanation, receipt, 'pt-BR')).toBe(false);
    expect(
      sameModelExplanation(explanation, { acceptedAt: explanation.acceptedAt, ...explanation }),
    ).toBe(true);
    expect(
      sameModelExplanation(explanation, {
        ...explanation,
        model: 'anthropic/claude-haiku-5.5',
      }),
    ).toBe(false);
  });
});
