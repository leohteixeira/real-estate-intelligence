import type { AskInputs, AskResult } from './ask-read.types.js';

export interface StructuredAskCreate {
  readonly mode: 'structured-price-v1';
  readonly threadId: string | null;
  readonly placeId: string | null;
  readonly query: string;
  readonly locale: 'en' | 'pt-BR';
  readonly inputs: AskInputs;
}
export type TextAskCreate = Omit<StructuredAskCreate, 'mode' | 'inputs'> & {
  readonly mode: 'text-price-v1';
};
export type ExplainedAskCreate = Omit<TextAskCreate, 'mode'> & {
  readonly mode: 'text-price-explanation-v1';
};
export type TextAskCreateInput = TextAskCreate | ExplainedAskCreate;
/** Internal admission only: these inputs are derived by Market, never supplied by text callers. */
export type ValidatedTextAskCreate = TextAskCreateInput & { readonly inputs: AskInputs };
export type ValidatedAskCreate =
  | StructuredAskCreate
  | ValidatedTextAskCreate
  | import('./intent-decision.types.js').ValidatedRoutedAskCreate;
export type PriceResult = Extract<AskResult, { kind: 'price_per_square_meter' }>;
export interface AskRequestedIdentity {
  readonly version: 1;
  readonly eventId: string;
  readonly runId: string;
  readonly threadId: string;
}
export interface HistoricalAskLiveRun {
  readonly basis: 'structured-price-v1' | 'text-price-v1';
  readonly id: string;
  readonly threadId: string;
  readonly principalId: null;
  readonly question: string;
  readonly locale: 'en' | 'pt-BR';
  readonly placeId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly state: 'queued' | 'running' | 'completed' | 'failed' | 'expired';
  readonly originalInputs: AskInputs;
  readonly decision: {
    readonly source: 'fixed-structured-v1' | 'validated-text-v1';
    readonly intent: 'price_per_square_meter';
    readonly decidedAt: string;
  } | null;
  readonly result: PriceResult | null;
  readonly terminal: {
    readonly state: 'completed' | 'failed' | 'expired';
    readonly reason: 'execution_unavailable' | 'queue_expired' | null;
    readonly at: string;
  } | null;
  readonly steps: readonly {
    readonly sequence: number;
    readonly phase: 'calculating' | 'completed' | 'failed' | 'expired';
    readonly at: string;
  }[];
}
export type ExplainedAskLiveRun = Omit<HistoricalAskLiveRun, 'basis'> & {
  readonly basis: 'text-price-explanation-v1';
  readonly explanation: import('./model-explanation.js').ModelExplanation | null;
};
export type AskLiveRun =
  | HistoricalAskLiveRun
  | ExplainedAskLiveRun
  | import('./intent-decision.types.js').RoutedLiveRun;
export interface AskLiveThread {
  readonly basis:
    | 'structured-price-v1'
    | 'text-price-v1'
    | 'text-price-explanation-v1'
    | 'routed-text-v1'
    | 'routed-text-explanation-v1'
    | 'mixed-price-v1';
  readonly id: string;
  readonly principalId: null;
  readonly runs: readonly AskLiveRun[];
}
export interface AskLiveEvent {
  readonly version: 1;
  readonly id: string;
  readonly runId: string;
  readonly sequence: number;
  readonly event: 'ask.progress' | 'ask.completed' | 'ask.failed' | 'ask.expired' | 'ask.cancelled';
  readonly terminal: boolean;
  readonly run: AskLiveRun;
}
export interface PriceToolRequest extends AskRequestedIdentity {
  readonly executionId: string;
  readonly operation: 'price-per-square-meter';
  readonly inputs: AskInputs;
}
export interface PriceToolReceipt extends PriceToolRequest {
  readonly receiptId: string;
  readonly provenance: 'market-domain-v1';
  readonly result: PriceResult;
}
export interface StructuredExecutionInput extends AskRequestedIdentity {
  readonly step: 'structured-price-v1';
  readonly query: string;
  readonly locale: 'en' | 'pt-BR';
  readonly executionId: string;
  readonly toolGrant: string;
  readonly checkpointGrant: string;
  readonly inputs: AskInputs;
}
export interface StructuredExecutionEvidence extends AskRequestedIdentity {
  readonly step: 'structured-price-v1';
  readonly outcome: 'price-calculated';
  readonly executionId: string;
  readonly visitedNodes: readonly ['fixedDecision', 'priceTool'];
  readonly receipt: PriceToolReceipt;
}
export type TextExecutionInput = Omit<StructuredExecutionInput, 'step'> & {
  readonly step: 'text-price-v1';
};
export type TextExecutionEvidence = Omit<StructuredExecutionEvidence, 'step' | 'visitedNodes'> & {
  readonly step: 'text-price-v1';
  readonly visitedNodes: readonly ['validatedInputs', 'priceTool'];
};
export type ExplainedExecutionInput = Omit<StructuredExecutionInput, 'step'> & {
  readonly step: 'text-price-explanation-v1';
};
export type ExplainedExecutionEvidence = Omit<
  StructuredExecutionEvidence,
  'step' | 'visitedNodes'
> & {
  readonly step: 'text-price-explanation-v1';
  readonly visitedNodes: readonly ['validatedInputs', 'priceTool', 'modelExplanation'];
  readonly explanation: import('./model-explanation.js').ModelExplanation;
};
export type PriceExecutionInput =
  | StructuredExecutionInput
  | TextExecutionInput
  | ExplainedExecutionInput
  | import('./intent-decision.types.js').RoutedPriceExecutionInput;
export type PriceExecutionEvidence =
  | StructuredExecutionEvidence
  | TextExecutionEvidence
  | ExplainedExecutionEvidence
  | import('./intent-decision.types.js').RoutedExecutionEvidence
  | import('./intent-decision.types.js').RoutedExplainedExecutionEvidence;
export type AskClaim =
  | {
      readonly disposition: 'busy';
      readonly identity: AskRequestedIdentity;
      readonly retryAfterMs: number;
    }
  | {
      readonly disposition: 'claimed';
      readonly identity: AskRequestedIdentity;
      readonly input: PriceExecutionInput;
      readonly expiresAt: string;
    }
  | {
      readonly disposition: 'terminal';
      readonly identity: AskRequestedIdentity;
      readonly run: AskLiveRun;
    };
export interface AskCompletion extends AskRequestedIdentity {
  readonly executionId: string;
  readonly evidence: PriceExecutionEvidence | null;
  readonly failure: 'execution_unavailable' | null;
}
