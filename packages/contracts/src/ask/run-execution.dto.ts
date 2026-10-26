import { parseRoutedExecutionInput, parseRoutedExecutionEvidence } from './intent-decision.dto.js';
import type { RoutedExecutionInput, RoutedExecutionEvidence } from './intent-decision.types.js';
import { invalidWire, parseWire, wireEnum, wireObject, wireUuid } from '../shared/wire.js';
import { askQueryWire } from './ask.read.dto.js';
import {
  parseStructuredExecutionRequest,
  parseStructuredExecutionEvidence,
  type StructuredExecutionRequest,
  type StructuredExecutionResponse,
  parseTextExecutionRequest,
  parseTextExecutionEvidence,
  type TextExecutionRequest,
  type TextExecutionResponse,
  parseExplainedExecutionRequest,
  parseExplainedExecutionEvidence,
  type ExplainedExecutionRequest,
  type ExplainedExecutionResponse,
} from './ask-live.dto.js';

/** Internal v1 shapes are independent of domain and public Ask command/result contracts. */
export interface FoundationExecutionRequest {
  readonly version: 1;
  readonly runId: string;
  readonly threadId: string;
  readonly step: 'foundation';
  readonly query: string;
  readonly locale: 'en' | 'pt-BR';
}
export interface FoundationExecutionResponse {
  readonly version: 1;
  readonly runId: string;
  readonly threadId: string;
  readonly step: 'foundation';
  readonly outcome: 'foundation-executed';
  readonly visitedNodes: readonly ['noOp'];
}
export type RunExecutionRequest =
  | FoundationExecutionRequest
  | StructuredExecutionRequest
  | TextExecutionRequest
  | ExplainedExecutionRequest
  | RoutedExecutionInput;
export type RunExecutionResponse =
  | FoundationExecutionResponse
  | StructuredExecutionResponse
  | TextExecutionResponse
  | ExplainedExecutionResponse
  | RoutedExecutionEvidence;
const identityFields = {
  version: wireEnum([1]),
  runId: wireUuid,
  threadId: wireUuid,
  step: wireEnum(['foundation']),
};

export function parseRunExecutionRequest(value: unknown): RunExecutionRequest {
  if (
    typeof value === 'object' &&
    value !== null &&
    'step' in value &&
    value.step === 'routed-text-v1'
  )
    return parseRoutedExecutionInput(value);
  if (
    typeof value === 'object' &&
    value !== null &&
    'step' in value &&
    value.step === 'text-price-explanation-v1'
  )
    return parseExplainedExecutionRequest(value);
  if (
    typeof value === 'object' &&
    value !== null &&
    'step' in value &&
    value.step === 'text-price-v1'
  )
    return parseTextExecutionRequest(value);
  if (
    typeof value === 'object' &&
    value !== null &&
    'step' in value &&
    value.step === 'structured-price-v1'
  )
    return parseStructuredExecutionRequest(value);
  return parseWire(
    value,
    wireObject({ ...identityFields, query: askQueryWire, locale: wireEnum(['en', 'pt-BR']) }),
  );
}
export function parseRunExecutionEvidence(value: unknown): RunExecutionResponse {
  if (
    typeof value === 'object' &&
    value !== null &&
    'step' in value &&
    value.step === 'routed-text-v1'
  )
    return parseRoutedExecutionEvidence(value);
  if (
    typeof value === 'object' &&
    value !== null &&
    'step' in value &&
    value.step === 'text-price-explanation-v1'
  )
    return parseExplainedExecutionEvidence(value);
  if (
    typeof value === 'object' &&
    value !== null &&
    'step' in value &&
    value.step === 'text-price-v1'
  )
    return parseTextExecutionEvidence(value);
  if (
    typeof value === 'object' &&
    value !== null &&
    'step' in value &&
    value.step === 'structured-price-v1'
  )
    return parseStructuredExecutionEvidence(value);
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
