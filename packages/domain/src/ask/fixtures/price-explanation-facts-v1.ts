import type { PriceToolReceipt } from '../ask-live.types.js';
import { explanationFacts } from '../model-explanation.js';

export const priceExplanationReceiptV1: PriceToolReceipt = {
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
/** Public synthetic fidelity corpus; case identifiers never include generated or visitor text. */
export function priceExplanationFactsV1(locale: 'en' | 'pt-BR') {
  const facts = explanationFacts(priceExplanationReceiptV1, locale);
  const golden = facts.join(' ');
  const valid = [];
  for (const first of [0, 1, 2])
    for (const second of [0, 1, 2])
      if (first !== second)
        valid.push({
          id: `exact-${locale}-${first}-${second}`,
          text: `${facts[first]} ${facts[second]} ${facts[3 - first - second]}`,
          accepted: true,
        });
  const invalid: readonly [string, unknown][] = [
    ['area', golden.replace('68', '69')],
    ['currency', golden.replace('BRL', 'USD')],
    ['unit', golden.replace('m²', 'ft²')],
    ['english-words', golden.replace('68', 'sixty-eight')],
    ['portuguese-words', golden.replace('68', 'sessenta e oito')],
    ['prediction', `${golden} The price will rise 20%.`],
    ['opinion', `${golden} This is a good deal.`],
    [
      'rounding',
      golden.replace(
        locale === 'en' ? '11,544.12' : '11.544,12',
        locale === 'en' ? '11,544.00' : '11.544,00',
      ),
    ],
    ['newline', golden + '\n'],
    ['spacing', golden.replace(' ', '  ')],
    ['truncated', golden.slice(0, -1)],
    ['oversized', 'x'.repeat(2049)],
    ['null', null],
    ['number', 123],
    ['object', { text: golden }],
  ];
  return [
    ...valid,
    ...invalid.map(([id, text]) => ({ id: `${id}-${locale}`, text, accepted: false })),
  ];
}
