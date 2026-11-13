import type { AskRequestedIdentity, PriceToolReceipt } from './ask-live.types.js';
import { formatPriceExplanationFacts } from '../market/index.js';

export const MODEL_EXPLANATION_PROMPT = 'price-explanation-prompt-v1' as const;
export const MODEL_EXPLANATION_GRAMMAR = 'price-explanation-facts-v1' as const;
export const MODEL_OUTPUT_BUDGET = 1000;
export type ExplanationLocale = 'en' | 'pt-BR';
export interface ModelExplanation extends AskRequestedIdentity {
  readonly explanationId: string;
  readonly toolReceiptId: string;
  readonly reservationId: string;
  readonly authorship: 'model-written';
  readonly promptVersion: typeof MODEL_EXPLANATION_PROMPT;
  readonly grammarVersion: typeof MODEL_EXPLANATION_GRAMMAR;
  readonly locale: ExplanationLocale;
  readonly text: string;
  readonly model: string;
  /** `vercel-ai-gateway` is historical (ADR 0029): retained records stay readable, none is new. */
  readonly route: 'anthropic-direct' | 'vercel-ai-gateway';
  /** Null on every direct record; only historical gateway records carry an identifier. */
  readonly privacyEvidenceId: string | null;
  readonly outputTokens: number;
  readonly acceptedAt: string;
}
export interface ModelExplanationAuthority extends AskRequestedIdentity {
  readonly executionId: string;
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
export type ModelExplanationRequest = ModelExplanationAuthority &
  (
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

/** A closed factual language: exact canonical facts, one sentence each, in any order. */
export function explanationFacts(
  receipt: PriceToolReceipt,
  locale: ExplanationLocale,
): readonly string[] {
  return formatPriceExplanationFacts(
    receipt.inputs.priceMinorUnits,
    receipt.inputs.areaSquareMeters,
    receipt.result.minorUnits,
    locale,
  );
}
export function validExplanationText(
  text: unknown,
  receipt: PriceToolReceipt,
  locale: ExplanationLocale,
): boolean {
  if (typeof text !== 'string' || text.length > 2048) return false;
  const facts = explanationFacts(receipt, locale);
  for (const first of [0, 1, 2])
    for (const second of [0, 1, 2]) {
      if (first === second) continue;
      const third = 3 - first - second;
      if (text === `${facts[first]} ${facts[second]} ${facts[third]}`) return true;
    }
  return false;
}
/** Execution IDs can change on recovery; immutable run and Market receipt identity cannot. */
export function validModelExplanation(
  explanation: ModelExplanation,
  receipt: PriceToolReceipt,
  locale: ExplanationLocale,
): boolean {
  return (
    explanation.version === receipt.version &&
    explanation.eventId === receipt.eventId &&
    explanation.runId === receipt.runId &&
    explanation.threadId === receipt.threadId &&
    explanation.toolReceiptId === receipt.receiptId &&
    explanation.locale === locale &&
    explanation.authorship === 'model-written' &&
    explanation.promptVersion === MODEL_EXPLANATION_PROMPT &&
    explanation.grammarVersion === MODEL_EXPLANATION_GRAMMAR &&
    (explanation.route === 'anthropic-direct'
      ? explanation.privacyEvidenceId === null
      : explanation.route === 'vercel-ai-gateway' &&
        typeof explanation.privacyEvidenceId === 'string') &&
    Number.isSafeInteger(explanation.outputTokens) &&
    explanation.outputTokens > 0 &&
    explanation.outputTokens <= MODEL_OUTPUT_BUDGET &&
    validExplanationText(explanation.text, receipt, locale)
  );
}
/** JSONB reorders object keys; identity comparison must never depend on serialization order. */
export function sameModelExplanation(left: ModelExplanation, right: ModelExplanation): boolean {
  return (
    Object.keys(left).length === Object.keys(right).length &&
    (Object.keys(left) as (keyof ModelExplanation)[]).every((key) => left[key] === right[key])
  );
}
