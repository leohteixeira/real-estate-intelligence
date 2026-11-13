import {
  invalidWire,
  parseWire,
  wireObject,
  wireEnum,
  wireUuid,
  wirePattern,
  wireNumber,
  wireDate,
  wireNull,
  wireNullable,
  wireDiscriminated,
  type WireValidator,
} from '../shared/wire.js';
import type { AskRequestedIdentity } from './ask-live.dto.js';

export interface ModelExplanation extends AskRequestedIdentity {
  readonly explanationId: string;
  readonly toolReceiptId: string;
  readonly reservationId: string;
  readonly authorship: 'model-written';
  readonly promptVersion: 'price-explanation-prompt-v1';
  readonly grammarVersion: 'price-explanation-facts-v1';
  readonly locale: 'en' | 'pt-BR';
  readonly text: string;
  readonly model: string;
  /** `vercel-ai-gateway` is historical (ADR 0029): retained records stay readable, none is new. */
  readonly route: 'anthropic-direct' | 'vercel-ai-gateway';
  /** Null on every direct record; only historical gateway records carry an identifier. */
  readonly privacyEvidenceId: string | null;
  readonly outputTokens: number;
  readonly acceptedAt: string;
}
export interface ModelAttemptReservation {
  readonly reservationId: string;
  readonly attemptKey: string;
  /** `privacy-probe` exists only on historical gateway reservations. */
  readonly purpose: 'privacy-probe' | 'explanation';
  readonly model: string;
  readonly route: 'anthropic-direct' | 'vercel-ai-gateway';
  readonly maxOutputTokens: number;
  readonly reservedTotal: number;
}
const identity = { version: wireEnum([1]), eventId: wireUuid, runId: wireUuid, threadId: wireUuid };
const model = wireEnum(['claude-haiku-5-5']);
const route = wireEnum(['anthropic-direct']);
const historicalModel = wireEnum(['anthropic/claude-haiku-5.5', 'deepseek/deepseek-v4-flash-0731']);
const historicalRoute = wireEnum(['vercel-ai-gateway']);
const attemptKey = wirePattern(/^[A-Za-z0-9_-]{16,128}$/);
const boundedText: WireValidator = (value) => {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 2048 ||
    Array.from(value).some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    invalidWire();
};
const explanationFields = {
  ...identity,
  explanationId: wireUuid,
  toolReceiptId: wireUuid,
  reservationId: wireUuid,
  authorship: wireEnum(['model-written']),
  promptVersion: wireEnum(['price-explanation-prompt-v1']),
  grammarVersion: wireEnum(['price-explanation-facts-v1']),
  locale: wireEnum(['en', 'pt-BR']),
  text: boundedText,
  outputTokens: wireNumber(1, 1000, true),
  acceptedAt: wireDate,
};
/** The route selects one closed shape; a direct record can never carry privacy evidence. */
export const modelExplanationWire = wireDiscriminated('route', {
  'anthropic-direct': wireObject({
    ...explanationFields,
    model,
    route,
    privacyEvidenceId: wireNull,
  }),
  'vercel-ai-gateway': wireObject({
    ...explanationFields,
    model: historicalModel,
    route: historicalRoute,
    privacyEvidenceId: attemptKey,
  }),
});
const reservationFields = {
  reservationId: wireUuid,
  attemptKey,
  maxOutputTokens: wireNumber(1, 1000, true),
  reservedTotal: wireNumber(1, 1000, true),
};
const reservationWire = wireDiscriminated('route', {
  'anthropic-direct': wireObject({
    ...reservationFields,
    purpose: wireEnum(['explanation']),
    model,
    route,
  }),
  'vercel-ai-gateway': wireObject({
    ...reservationFields,
    purpose: wireEnum(['privacy-probe', 'explanation']),
    model: historicalModel,
    route: historicalRoute,
  }),
});
export type ModelExplanationRequest = AskRequestedIdentity & { readonly executionId: string } & (
    | { readonly operation: 'get' }
    | {
        readonly operation: 'reserve';
        readonly attemptKey: string;
        readonly purpose: 'explanation';
        readonly model: string;
        readonly route: 'anthropic-direct';
        readonly maxOutputTokens: number;
      }
    | { readonly operation: 'accept'; readonly explanation: ModelExplanation }
  );
export type ModelExplanationResponse =
  | { readonly operation: 'get'; readonly explanation: ModelExplanation | null }
  | { readonly operation: 'reserve'; readonly reservation: ModelAttemptReservation }
  | { readonly operation: 'accept'; readonly explanation: ModelExplanation };
export function parseModelExplanation(value: unknown): ModelExplanation {
  return parseWire(value, modelExplanationWire);
}
export function parseModelExplanationRequest(value: unknown): ModelExplanationRequest {
  const base = { ...identity, executionId: wireUuid };
  const operation =
    typeof value === 'object' && value !== null && 'operation' in value ? value.operation : null;
  return parseWire(
    value,
    operation === 'reserve'
      ? wireObject({
          ...base,
          operation: wireEnum(['reserve']),
          attemptKey,
          // New spend is direct only; the historical gateway literals are read-only.
          purpose: wireEnum(['explanation']),
          model,
          route,
          maxOutputTokens: wireNumber(1, 1000, true),
        })
      : operation === 'accept'
        ? wireObject({
            ...base,
            operation: wireEnum(['accept']),
            explanation: modelExplanationWire,
          })
        : wireObject({ ...base, operation: wireEnum(['get']) }),
  );
}
export function parseModelExplanationResponse(value: unknown): ModelExplanationResponse {
  const operation =
    typeof value === 'object' && value !== null && 'operation' in value ? value.operation : null;
  return parseWire(
    value,
    operation === 'reserve'
      ? wireObject({ operation: wireEnum(['reserve']), reservation: reservationWire })
      : operation === 'accept'
        ? wireObject({ operation: wireEnum(['accept']), explanation: modelExplanationWire })
        : wireObject({
            operation: wireEnum(['get']),
            explanation: wireNullable(modelExplanationWire),
          }),
  );
}
