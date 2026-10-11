/** Foundation graph traversal only; this is neither an analysis result nor durable completion. */
export interface FoundationExecutionInput {
  readonly version: 1;
  readonly runId: string;
  readonly threadId: string;
  readonly step: 'foundation';
  readonly query: string;
  readonly locale: 'en' | 'pt-BR';
}

export interface FoundationExecutionEvidence {
  readonly version: 1;
  readonly runId: string;
  readonly threadId: string;
  readonly step: 'foundation';
  readonly outcome: 'foundation-executed';
  readonly visitedNodes: readonly ['noOp'];
}
export type RunExecutionInput =
  | FoundationExecutionInput
  | import('./ask-live.types.js').PriceExecutionInput;
export type RunExecutionEvidence =
  | FoundationExecutionEvidence
  | import('./ask-live.types.js').PriceExecutionEvidence;
