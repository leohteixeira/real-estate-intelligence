/** Foundation graph traversal only; this is neither an analysis result nor durable completion. */
export interface RunExecutionInput {
  readonly version: 1;
  readonly runId: string;
  readonly threadId: string;
  readonly step: 'foundation';
  readonly query: string;
  readonly locale: 'en' | 'pt-BR';
}

export interface RunExecutionEvidence {
  readonly version: 1;
  readonly runId: string;
  readonly threadId: string;
  readonly step: 'foundation';
  readonly outcome: 'foundation-executed';
  readonly visitedNodes: readonly ['noOp'];
}
