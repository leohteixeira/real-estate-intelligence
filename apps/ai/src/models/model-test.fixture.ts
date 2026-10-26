import {
  parseModelExplanationResponse,
  parsePriceToolReceipt,
  type ModelExplanation,
} from '@rei/contracts';
import type { LanguageModelResult } from './language-model.port';
import type { ModelExplanationTransport } from './model-explanation.port';
import { ModelExplanationFailure } from './language-model.port';
export const modelReceipt = parsePriceToolReceipt({
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
});
export function acknowledged(model: string, text = 'ready', outputTokens = 1): LanguageModelResult {
  return {
    text,
    outputTokens,
    model,
    route: 'vercel-ai-gateway',
    warnings: [],
    metadata: {
      gateway: {
        routing: {
          planningReasoning:
            'ZDR requested: 1 attempts → 1 ZDR attempts. ZDR execution order: anthropic(system)',
        },
      },
    },
  };
}
/** Test-only persistent API double; production DI never selects this implementation. */
export function modelTransportFixture(): ModelExplanationTransport & {
  accepted: ModelExplanation | null;
  reserved: number;
  operations: string[];
} {
  return {
    accepted: null,
    reserved: 0,
    operations: [],
    async execute(request) {
      this.operations.push(request.operation);
      if (request.operation === 'get')
        return parseModelExplanationResponse({ operation: 'get', explanation: this.accepted });
      if (request.operation === 'accept') {
        this.accepted = structuredClone(request.explanation);
        return { operation: 'accept', explanation: this.accepted };
      }
      if (this.reserved + request.maxOutputTokens > 1000)
        throw new ModelExplanationFailure('budget');
      this.reserved += request.maxOutputTokens;
      return parseModelExplanationResponse({
        operation: 'reserve',
        reservation: {
          reservationId: `0199c8f2-2394-7ba0-8f9e-${String(this.reserved).padStart(12, '0')}`,
          attemptKey: request.attemptKey,
          purpose: request.purpose,
          model: request.model,
          route: request.route,
          maxOutputTokens: request.maxOutputTokens,
          reservedTotal: this.reserved,
        },
      });
    },
  };
}
