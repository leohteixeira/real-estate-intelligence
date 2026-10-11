import { invalidWire, parseWire, wireEnum, wireObject, wireUuid } from '../shared/wire.js';
import { askQueryWire } from './ask.read.dto.js';

/** Internal v1 shapes are independent of domain and public Ask command/result contracts. */
export interface RunExecutionRequest {
  readonly version: 1;
  readonly runId: string;
  readonly threadId: string;
  readonly step: 'foundation';
  readonly query: string;
  readonly locale: 'en' | 'pt-BR';
}
export interface RunExecutionResponse {
  readonly version: 1;
  readonly runId: string;
  readonly threadId: string;
  readonly step: 'foundation';
  readonly outcome: 'foundation-executed';
  readonly visitedNodes: readonly ['noOp'];
}
const identityFields = {
  version: wireEnum([1]),
  runId: wireUuid,
  threadId: wireUuid,
  step: wireEnum(['foundation']),
};

export function parseRunExecutionRequest(value: unknown): RunExecutionRequest {
  return parseWire(
    value,
    wireObject({ ...identityFields, query: askQueryWire, locale: wireEnum(['en', 'pt-BR']) }),
  );
}
export function parseRunExecutionEvidence(value: unknown): RunExecutionResponse {
  return parseWire(
    value,
    wireObject({
      ...identityFields,
      outcome: wireEnum(['foundation-executed']),
      visitedNodes: (nodes) => {
        if (!Array.isArray(nodes) || nodes.length !== 1 || nodes[0] !== 'noOp') invalidWire();
      },
    }),
  );
}
