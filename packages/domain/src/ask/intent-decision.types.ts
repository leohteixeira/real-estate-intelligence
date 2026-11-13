import type { AskInputs } from './ask-read.types.js';
import type {
  AskRequestedIdentity,
  HistoricalAskLiveRun,
  PriceToolReceipt,
  PriceResult,
} from './ask-live.types.js';

export const askIntents = [
  'price_per_square_meter',
  'listing_search',
  'property_history',
  'region_statistics',
  'comparables',
  'unsupported',
] as const;
export type AskIntent = (typeof askIntents)[number];
export interface UnavailableIntentResult {
  readonly kind: 'unavailable_intent';
  readonly intent: Exclude<AskIntent, 'price_per_square_meter'>;
  readonly reason: 'not_available';
}
export interface IntentDecision {
  readonly intent: AskIntent;
  readonly probability: number;
  readonly probabilities: Readonly<Record<AskIntent, number>>;
  /** `gateway-jev-v1` is historical (ADR 0029): retained receipts stay readable, none is new. */
  readonly source: 'claude-haiku-v1' | 'gateway-jev-v1' | 'heuristic-v1';
  readonly degraded: boolean;
  readonly taxonomyVersion: 'ask-intents-v1';
  /** Non-null exactly on historical `gateway-jev-v1` receipts. */
  readonly privacyEvidenceId: string | null;
}
export interface IntentDecisionReceipt extends IntentDecision {
  readonly receiptId: string;
  readonly acceptedAt: string;
}
export type RoutedAskCreate = {
  readonly mode: 'routed-text-v1';
  readonly threadId: string | null;
  readonly placeId: string | null;
  readonly query: string;
  readonly locale: 'en' | 'pt-BR';
};
export type RoutedExplainedAskCreate = Omit<RoutedAskCreate, 'mode'> & {
  readonly mode: 'routed-text-explanation-v1';
};
export type RoutedAskCreateInput = RoutedAskCreate | RoutedExplainedAskCreate;
export type ValidatedRoutedAskCreate = RoutedAskCreateInput & { readonly inputs: AskInputs | null };
export type RoutedAskLiveRun = Omit<
  HistoricalAskLiveRun,
  'basis' | 'state' | 'originalInputs' | 'decision' | 'terminal' | 'steps' | 'result'
> & {
  readonly basis: 'routed-text-v1';
  readonly result: PriceResult | UnavailableIntentResult | null;
  readonly state:
    | 'queued'
    | 'running'
    | 'awaiting_confirmation'
    | 'completed'
    | 'failed'
    | 'expired'
    | 'cancelled';
  readonly originalInputs: AskInputs | null;
  readonly decision: IntentDecisionReceipt | null;
  readonly confirmation: {
    readonly decisionReceiptId: string;
    readonly inputs: AskInputs | null;
    readonly at: string;
  } | null;
  readonly confirmationDeadline: string | null;
  readonly terminal: {
    readonly state: 'completed' | 'failed' | 'expired' | 'cancelled';
    readonly reason:
      | 'execution_unavailable'
      | 'queue_expired'
      | 'confirmation_expired'
      | 'visitor_cancelled'
      | null;
    readonly at: string;
  } | null;
  readonly steps: readonly {
    readonly sequence: number;
    readonly phase:
      | 'routing'
      | 'awaiting_confirmation'
      | 'confirmed'
      | 'completed'
      | 'failed'
      | 'expired'
      | 'cancelled';
    readonly at: string;
  }[];
};
export type RoutedExplainedAskLiveRun = Omit<RoutedAskLiveRun, 'basis'> & {
  readonly basis: 'routed-text-explanation-v1';
  readonly explanation: import('./model-explanation.js').ModelExplanation | null;
};
export type RoutedLiveRun = RoutedAskLiveRun | RoutedExplainedAskLiveRun;
export interface RoutedExecutionInput extends AskRequestedIdentity {
  readonly step: 'routed-text-v1';
  readonly query: string;
  readonly locale: 'en' | 'pt-BR';
  readonly executionId: string;
  readonly toolGrant: string;
  readonly checkpointGrant: string;
  readonly inputs: AskInputs | null;
}
export type RoutedExecutionEvidence = AskRequestedIdentity & {
  readonly step: 'routed-text-v1';
  readonly executionId: string;
  readonly decisionReceiptId: string;
} & (
    | { readonly outcome: 'awaiting-confirmation' | 'execution-unavailable' }
    | { readonly outcome: 'price-calculated'; readonly receipt: PriceToolReceipt }
  );
export type RoutedExplainedExecutionInput = Omit<RoutedExecutionInput, 'step'> & {
  readonly step: 'routed-text-explanation-v1';
  readonly admittedAt: string;
  readonly queueDurationMs: number;
};
export type RoutedPriceExecutionInput = RoutedExecutionInput | RoutedExplainedExecutionInput;
export type RoutedExplainedExecutionEvidence = AskRequestedIdentity & {
  readonly step: 'routed-text-explanation-v1';
  readonly executionId: string;
  readonly decisionReceiptId: string;
} & (
    | { readonly outcome: 'awaiting-confirmation' | 'execution-unavailable' }
    | {
        readonly outcome: 'price-calculated';
        readonly receipt: PriceToolReceipt;
        readonly explanation: import('./model-explanation.js').ModelExplanation;
      }
  );
export type IntentDecisionRequest = AskRequestedIdentity & { readonly executionId: string } & (
    | { readonly operation: 'get' }
    | { readonly operation: 'reserve'; readonly attemptKey: string }
    | {
        readonly operation: 'accept';
        readonly reservationId: string;
        readonly decision: IntentDecision;
      }
  );
export type IntentDecisionResponse =
  | {
      readonly operation: 'get';
      readonly decision: IntentDecisionReceipt | null;
      readonly confirmation: RoutedAskLiveRun['confirmation'];
    }
  | { readonly operation: 'reserve'; readonly reservationId: string }
  | { readonly operation: 'accept'; readonly decision: IntentDecisionReceipt };
export interface RoutedAskConfirmation {
  readonly runId: string;
  readonly decisionReceiptId: string;
  readonly inputs: AskInputs | null;
}
