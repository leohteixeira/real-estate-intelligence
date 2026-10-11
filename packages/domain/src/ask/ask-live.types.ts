import type { AskInputs, AskResult } from './ask-read.types.js';

export interface StructuredAskCreate {
  readonly mode: 'structured-price-v1';
  readonly threadId: string | null;
  readonly placeId: string | null;
  readonly query: string;
  readonly locale: 'en' | 'pt-BR';
  readonly inputs: AskInputs;
}
export type PriceResult = Extract<AskResult, { kind: 'price_per_square_meter' }>;
export interface AskRequestedIdentity {
  readonly version: 1;
  readonly eventId: string;
  readonly runId: string;
  readonly threadId: string;
}
export interface AskLiveRun {
  readonly basis: 'structured-price-v1';
  readonly id: string;
  readonly threadId: string;
  readonly principalId: null;
  readonly question: string;
  readonly locale: 'en' | 'pt-BR';
  readonly placeId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly state: 'queued' | 'running' | 'completed' | 'failed';
  readonly originalInputs: AskInputs;
  readonly decision: {
    readonly source: 'fixed-structured-v1';
    readonly intent: 'price_per_square_meter';
    readonly decidedAt: string;
  } | null;
  readonly result: PriceResult | null;
  readonly terminal: {
    readonly state: 'completed' | 'failed';
    readonly reason: 'execution_unavailable' | null;
    readonly at: string;
  } | null;
  readonly steps: readonly {
    readonly sequence: number;
    readonly phase: 'calculating' | 'completed' | 'failed';
    readonly at: string;
  }[];
}
export interface AskLiveThread {
  readonly basis: 'structured-price-v1';
  readonly id: string;
  readonly principalId: null;
  readonly runs: readonly AskLiveRun[];
}
export interface AskLiveEvent {
  readonly version: 1;
  readonly id: string;
  readonly runId: string;
  readonly sequence: number;
  readonly event: 'ask.progress' | 'ask.completed' | 'ask.failed';
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
  readonly inputs: AskInputs;
}
export interface StructuredExecutionEvidence extends AskRequestedIdentity {
  readonly step: 'structured-price-v1';
  readonly outcome: 'price-calculated';
  readonly executionId: string;
  readonly visitedNodes: readonly ['fixedDecision', 'priceTool'];
  readonly receipt: PriceToolReceipt;
}
export type AskClaim =
  | {
      readonly disposition: 'busy';
      readonly identity: AskRequestedIdentity;
      readonly retryAfterMs: number;
    }
  | {
      readonly disposition: 'claimed';
      readonly identity: AskRequestedIdentity;
      readonly input: StructuredExecutionInput;
      readonly expiresAt: string;
    }
  | {
      readonly disposition: 'terminal';
      readonly identity: AskRequestedIdentity;
      readonly run: AskLiveRun;
    };
export interface AskCompletion extends AskRequestedIdentity {
  readonly executionId: string;
  readonly evidence: StructuredExecutionEvidence | null;
  readonly failure: 'execution_unavailable' | null;
}
