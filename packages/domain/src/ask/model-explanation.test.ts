import { describe, expect, it } from 'vitest';
import type { PriceToolReceipt } from './ask-live.types.js';
import {
  explanationFacts,
  validExplanationText,
  validModelExplanation,
  sameModelExplanation,
  type ModelExplanation,
} from './model-explanation.js';

const receipt: PriceToolReceipt = {
  version: 1,
  eventId: '0199c8f2-2394-7ba0-8f9e-286378779212',
  runId: '0199c8f2-2394-7ba0-8f9e-286378779210',
  threadId: '0199c8f2-2394-7ba0-8f9e-286378779211',
  executionId: '0199c8f2-2394-7ba0-8f9e-286378779213',
  receiptId: '0199c8f2-2394-7ba0-8f9e-286378779214',
  operation: 'price-per-square-meter',
  provenance: 'market-domain-v1',
  inputs: { priceMinorUnits: 78500000, currency: 'BRL', areaSquareMeters: 68 },
  result: {
    kind: 'price_per_square_meter',
    minorUnits: 1154412,
    currency: 'BRL',
    areaUnit: 'm2',
    inputs: { priceMinorUnits: 78500000, currency: 'BRL', areaSquareMeters: 68 },
    computedAt: '2026-10-11T00:00:00.000Z',
  },
};
describe('price-explanation-facts-v1 offline PT/EN fidelity dataset', () => {
  it.each(['en', 'pt-BR'] as const)('accepts only full exact facts in any order (%s)', (locale) => {
    const facts = explanationFacts(receipt, locale);
    for (const first of [0, 1, 2])
      for (const second of [0, 1, 2])
        if (first !== second)
          expect(
            validExplanationText(
              `${facts[first]} ${facts[second]} ${facts[3 - first - second]}`,
              receipt,
              locale,
            ),
          ).toBe(true);
    expect(facts[2]).toContain(locale === 'en' ? 'BRL 11,544.12/m²' : 'BRL 11.544,12/m²');
  });
  it.each(['en', 'pt-BR'] as const)('rejects the complete adversarial matrix (%s)', (locale) => {
    const golden = explanationFacts(receipt, locale).join(' ');
    for (const text of [
      golden.replace('68', '69'),
      golden.replace('BRL', 'USD'),
      golden.replace('m²', 'ft²'),
      golden.replace('68', 'sixty-eight'),
      golden.replace('68', 'sessenta e oito'),
      `${golden} The price will rise 20%.`,
      `${golden} This is a good deal.`,
      golden.replace(
        locale === 'en' ? '11,544.12' : '11.544,12',
        locale === 'en' ? '11,544.00' : '11.544,00',
      ),
      golden + '\n',
      golden.replace(' ', '  '),
      golden.slice(0, -1),
      'x'.repeat(2049),
      null,
      123,
      { text: golden },
    ])
      expect(validExplanationText(text, receipt, locale)).toBe(false);
  });
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
      model: 'anthropic/claude-haiku-5.5',
      route: 'vercel-ai-gateway',
      privacyEvidenceId: 'p'.repeat(32),
      outputTokens: 50,
      acceptedAt: receipt.result.computedAt,
    };
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
        model: 'deepseek/deepseek-v4-flash-0731',
      }),
    ).toBe(false);
  });
});
