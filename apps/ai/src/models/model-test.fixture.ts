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
export const approvedModel = 'claude-haiku-5-5';
export function generated(text: string, outputTokens = 1): LanguageModelResult {
  return { text, outputTokens, model: approvedModel, route: 'anthropic-direct' };
}
/** Messages API response body for intercepted HTTP. No SDK or module is mocked. */
export function anthropicMessage(
  text: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'msg_offline_fixture',
    type: 'message',
    role: 'assistant',
    model: approvedModel,
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 12, output_tokens: 7 },
    ...overrides,
  };
}
/** Messages API error body with the documented `error.type` discriminant. */
export function anthropicError(type: string): Record<string, unknown> {
  return { type: 'error', error: { type, message: 'private provider detail' } };
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
