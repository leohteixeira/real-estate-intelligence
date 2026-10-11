import {
  invalidWire,
  parseWire,
  wireArray,
  wireBoolean,
  wireDate,
  wireEnum,
  wireMoney,
  wireNull,
  wireNullable,
  wireNumber,
  wireObject,
  wirePattern,
  wireSlug,
  wireUuid,
} from '../shared/wire.js';
import { askInputsWire, askQueryWire } from './ask.read.dto.js';
import type { AskInputs } from './ask.read.types.js';

// These contracts deliberately own their types independently of the domain package.
export interface StructuredAskCreate {
  readonly mode: 'structured-price-v1';
  readonly threadId: string | null;
  readonly placeId: string | null;
  readonly query: string;
  readonly locale: 'en' | 'pt-BR';
  readonly inputs: AskInputs;
}
export interface StructuredAskAccepted {
  readonly mode: 'structured-price-v1';
  readonly runId: string;
  readonly threadId: string;
  readonly state: 'queued';
}
export type TextAskCreate = Omit<StructuredAskCreate, 'mode' | 'inputs'> & {
  readonly mode: 'text-price-v1';
};
export type TextAskAccepted = Omit<StructuredAskAccepted, 'mode'> & {
  readonly mode: 'text-price-v1';
};
export type PriceInputRefusalReason =
  | 'missing_price'
  | 'missing_area'
  | 'ambiguous_price'
  | 'ambiguous_area'
  | 'invalid_price'
  | 'invalid_area'
  | 'unsupported_currency'
  | 'unsupported_area_unit'
  | 'unsafe_result';
export interface TextAskRefused {
  readonly mode: 'text-price-v1';
  readonly code: 'price_input_refused';
  readonly reason: PriceInputRefusalReason;
}
const textQueryWire = (value: unknown) => {
  askQueryWire(value);
  if (
    typeof value !== 'string' ||
    Array.from(value).some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    invalidWire();
};
export function parseTextAskCreate(value: unknown): TextAskCreate {
  return parseWire(
    value,
    wireObject({
      mode: wireEnum(['text-price-v1']),
      threadId: wireNullable(wireUuid),
      placeId: wireNullable(wireSlug),
      query: textQueryWire,
      locale: wireEnum(['en', 'pt-BR']),
    }),
  );
}
export function parseTextAskAccepted(value: unknown): TextAskAccepted {
  return parseWire(
    value,
    wireObject({
      mode: wireEnum(['text-price-v1']),
      runId: wireUuid,
      threadId: wireUuid,
      state: wireEnum(['queued']),
    }),
  );
}
export function parseTextAskRefused(value: unknown): TextAskRefused {
  return parseWire(
    value,
    wireObject({
      mode: wireEnum(['text-price-v1']),
      code: wireEnum(['price_input_refused']),
      reason: wireEnum([
        'missing_price',
        'missing_area',
        'ambiguous_price',
        'ambiguous_area',
        'invalid_price',
        'invalid_area',
        'unsupported_currency',
        'unsupported_area_unit',
        'unsafe_result',
      ]),
    }),
  );
}
export function parseStructuredAskAccepted(value: unknown): StructuredAskAccepted {
  return parseWire(
    value,
    wireObject({
      mode: wireEnum(['structured-price-v1']),
      runId: wireUuid,
      threadId: wireUuid,
      state: wireEnum(['queued']),
    }),
  );
}
export interface PriceResult {
  readonly kind: 'price_per_square_meter';
  readonly minorUnits: number;
  readonly currency: 'BRL';
  readonly areaUnit: 'm2';
  readonly inputs: AskInputs;
  readonly computedAt: string;
}
export interface AskRequestedIdentity {
  readonly version: 1;
  readonly eventId: string;
  readonly runId: string;
  readonly threadId: string;
}
export interface AskLiveRun {
  readonly basis: 'structured-price-v1' | 'text-price-v1';
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
    readonly source: 'fixed-structured-v1' | 'validated-text-v1';
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
  readonly basis: 'structured-price-v1' | 'text-price-v1' | 'mixed-price-v1';
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
export interface StructuredExecutionRequest extends AskRequestedIdentity {
  readonly step: 'structured-price-v1';
  readonly query: string;
  readonly locale: 'en' | 'pt-BR';
  readonly executionId: string;
  readonly toolGrant: string;
  readonly inputs: AskInputs;
}
export interface StructuredExecutionResponse extends AskRequestedIdentity {
  readonly step: 'structured-price-v1';
  readonly outcome: 'price-calculated';
  readonly executionId: string;
  readonly visitedNodes: readonly ['fixedDecision', 'priceTool'];
  readonly receipt: PriceToolReceipt;
}
export type TextExecutionRequest = Omit<StructuredExecutionRequest, 'step'> & {
  readonly step: 'text-price-v1';
};
export type TextExecutionResponse = Omit<StructuredExecutionResponse, 'step' | 'visitedNodes'> & {
  readonly step: 'text-price-v1';
  readonly visitedNodes: readonly ['validatedInputs', 'priceTool'];
};
export type PriceExecutionRequest = StructuredExecutionRequest | TextExecutionRequest;
export type PriceExecutionResponse = StructuredExecutionResponse | TextExecutionResponse;
export type AskClaim =
  | {
      readonly disposition: 'busy';
      readonly identity: AskRequestedIdentity;
      readonly retryAfterMs: number;
    }
  | {
      readonly disposition: 'claimed';
      readonly identity: AskRequestedIdentity;
      readonly input: PriceExecutionRequest;
      readonly expiresAt: string;
    }
  | {
      readonly disposition: 'terminal';
      readonly identity: AskRequestedIdentity;
      readonly run: AskLiveRun;
    };
export interface AskCompletion extends AskRequestedIdentity {
  readonly executionId: string;
  readonly evidence: PriceExecutionResponse | null;
  readonly failure: 'execution_unavailable' | null;
}
export const strongAskCapabilityWire = wirePattern(/^[A-Za-z0-9_-]{43,128}$/);
export const requestedIdentityWire = wireObject({
  version: wireEnum([1]),
  eventId: wireUuid,
  runId: wireUuid,
  threadId: wireUuid,
});
const identityFields = {
  version: wireEnum([1]),
  eventId: wireUuid,
  runId: wireUuid,
  threadId: wireUuid,
};
export const priceResultWire = wireObject({
  kind: wireEnum(['price_per_square_meter']),
  minorUnits: wireMoney,
  currency: wireEnum(['BRL']),
  areaUnit: wireEnum(['m2']),
  inputs: askInputsWire,
  computedAt: wireDate,
});
export const priceToolRequestWire = wireObject({
  ...identityFields,
  executionId: wireUuid,
  operation: wireEnum(['price-per-square-meter']),
  inputs: askInputsWire,
});
export const priceToolReceiptWire = wireObject({
  ...identityFields,
  executionId: wireUuid,
  operation: wireEnum(['price-per-square-meter']),
  inputs: askInputsWire,
  receiptId: wireUuid,
  provenance: wireEnum(['market-domain-v1']),
  result: priceResultWire,
});
export const structuredExecutionWire = wireObject({
  ...identityFields,
  step: wireEnum(['structured-price-v1']),
  query: askQueryWire,
  locale: wireEnum(['en', 'pt-BR']),
  executionId: wireUuid,
  toolGrant: strongAskCapabilityWire,
  inputs: askInputsWire,
});
export const structuredEvidenceWire = wireObject({
  ...identityFields,
  step: wireEnum(['structured-price-v1']),
  outcome: wireEnum(['price-calculated']),
  executionId: wireUuid,
  visitedNodes: (value) => {
    if (
      !Array.isArray(value) ||
      value.length !== 2 ||
      value[0] !== 'fixedDecision' ||
      value[1] !== 'priceTool'
    )
      invalidWire();
  },
  receipt: priceToolReceiptWire,
});
export const textExecutionWire = wireObject({
  ...identityFields,
  step: wireEnum(['text-price-v1']),
  query: textQueryWire,
  locale: wireEnum(['en', 'pt-BR']),
  executionId: wireUuid,
  toolGrant: strongAskCapabilityWire,
  inputs: askInputsWire,
});
export const textEvidenceWire = wireObject({
  ...identityFields,
  step: wireEnum(['text-price-v1']),
  outcome: wireEnum(['price-calculated']),
  executionId: wireUuid,
  visitedNodes: (nodes) => {
    if (
      !Array.isArray(nodes) ||
      nodes.length !== 2 ||
      nodes[0] !== 'validatedInputs' ||
      nodes[1] !== 'priceTool'
    )
      invalidWire();
  },
  receipt: priceToolReceiptWire,
});
export function parseTextExecutionRequest(value: unknown): TextExecutionRequest {
  return parseWire(value, textExecutionWire);
}
export function parseTextExecutionEvidence(value: unknown): TextExecutionResponse {
  const evidence = parseWire<TextExecutionResponse>(value, textEvidenceWire);
  parsePriceToolReceipt(evidence.receipt);
  if (
    !sameAskIdentity(evidence, evidence.receipt) ||
    evidence.executionId !== evidence.receipt.executionId
  )
    invalidWire();
  return evidence;
}
const priceExecutionWire = (value: unknown) => {
  if (
    typeof value === 'object' &&
    value !== null &&
    'step' in value &&
    value.step === 'text-price-v1'
  )
    textExecutionWire(value);
  else structuredExecutionWire(value);
};
const priceEvidenceWire = (value: unknown) => {
  if (
    typeof value === 'object' &&
    value !== null &&
    'step' in value &&
    value.step === 'text-price-v1'
  )
    textEvidenceWire(value);
  else structuredEvidenceWire(value);
};
const liveRunWire = wireObject({
  basis: wireEnum(['structured-price-v1', 'text-price-v1']),
  id: wireUuid,
  threadId: wireUuid,
  principalId: wireNull,
  question: askQueryWire,
  locale: wireEnum(['en', 'pt-BR']),
  placeId: wireNullable(wireSlug),
  createdAt: wireDate,
  updatedAt: wireDate,
  state: wireEnum(['queued', 'running', 'completed', 'failed']),
  originalInputs: askInputsWire,
  decision: wireNullable(
    wireObject({
      source: wireEnum(['fixed-structured-v1', 'validated-text-v1']),
      intent: wireEnum(['price_per_square_meter']),
      decidedAt: wireDate,
    }),
  ),
  result: wireNullable(priceResultWire),
  terminal: wireNullable(
    wireObject({
      state: wireEnum(['completed', 'failed']),
      reason: wireNullable(wireEnum(['execution_unavailable'])),
      at: wireDate,
    }),
  ),
  steps: wireArray(
    wireObject({
      sequence: wireNumber(1, 100, true),
      phase: wireEnum(['calculating', 'completed', 'failed']),
      at: wireDate,
    }),
  ),
});
export function sameAskInputs(a: AskInputs, b: AskInputs): boolean {
  return (
    a.currency === b.currency &&
    a.priceMinorUnits === b.priceMinorUnits &&
    a.areaSquareMeters === b.areaSquareMeters
  );
}
export function sameAskIdentity(a: AskRequestedIdentity, b: AskRequestedIdentity): boolean {
  return (
    a.version === b.version &&
    a.eventId === b.eventId &&
    a.runId === b.runId &&
    a.threadId === b.threadId
  );
}
export function parseStructuredAskCreate(value: unknown): StructuredAskCreate {
  const parsed = parseWire<StructuredAskCreate>(
    value,
    wireObject({
      mode: wireEnum(['structured-price-v1']),
      threadId: wireNullable(wireUuid),
      placeId: wireNullable(wireSlug),
      query: askQueryWire,
      locale: wireEnum(['en', 'pt-BR']),
      inputs: askInputsWire,
    }),
  );
  if (
    !Number.isSafeInteger(
      Math.round(parsed.inputs.priceMinorUnits / parsed.inputs.areaSquareMeters),
    ) ||
    Math.round(parsed.inputs.priceMinorUnits / parsed.inputs.areaSquareMeters) < 1
  )
    invalidWire();
  return parsed;
}
export function parseAskRequestedIdentity(value: unknown): AskRequestedIdentity {
  return parseWire(value, requestedIdentityWire);
}
export function parsePriceToolRequest(value: unknown): PriceToolRequest {
  return parseWire(value, priceToolRequestWire);
}
export function parsePriceToolReceipt(value: unknown): PriceToolReceipt {
  const receipt = parseWire<PriceToolReceipt>(value, priceToolReceiptWire);
  if (!sameAskInputs(receipt.inputs, receipt.result.inputs)) invalidWire();
  return receipt;
}
export function parseStructuredExecutionRequest(value: unknown): StructuredExecutionRequest {
  return parseWire(value, structuredExecutionWire);
}
export function parseStructuredExecutionEvidence(value: unknown): StructuredExecutionResponse {
  const evidence = parseWire<StructuredExecutionResponse>(value, structuredEvidenceWire);
  parsePriceToolReceipt(evidence.receipt);
  if (
    !sameAskIdentity(evidence, evidence.receipt) ||
    evidence.executionId !== evidence.receipt.executionId
  )
    invalidWire();
  return evidence;
}
export function parseAskLiveRun(value: unknown): AskLiveRun {
  const run = parseWire<AskLiveRun>(value, liveRunWire);
  if (run.basis === 'text-price-v1') textQueryWire(run.question);
  if (
    run.decision &&
    run.decision.source !==
      (run.basis === 'text-price-v1' ? 'validated-text-v1' : 'fixed-structured-v1')
  )
    invalidWire();
  const terminal = run.state === 'completed' || run.state === 'failed';
  if (
    run.createdAt > run.updatedAt ||
    terminal !== (run.terminal !== null) ||
    (run.state === 'completed') !== (run.result !== null)
  )
    invalidWire();
  if (
    run.terminal &&
    (run.terminal.state !== run.state ||
      run.terminal.at !== run.updatedAt ||
      (run.state === 'completed'
        ? run.terminal.reason !== null
        : run.terminal.reason !== 'execution_unavailable'))
  )
    invalidWire();
  if (run.state === 'queued' && (run.decision || run.steps.length)) invalidWire();
  if (run.steps.length !== (run.state === 'queued' ? 0 : terminal ? 2 : 1)) invalidWire();
  if (run.state !== 'queued' && (!run.decision || run.steps[0]?.phase !== 'calculating'))
    invalidWire();
  if (
    run.decision &&
    (run.decision.decidedAt < run.createdAt ||
      run.decision.decidedAt > run.updatedAt ||
      run.decision.decidedAt !== run.steps[0]?.at)
  )
    invalidWire();
  let previous = run.createdAt;
  for (const [index, step] of run.steps.entries()) {
    if (
      step.sequence !== index + 1 ||
      step.at < previous ||
      step.at > run.updatedAt ||
      (step.phase !== 'calculating' && (index !== run.steps.length - 1 || step.phase !== run.state))
    )
      invalidWire();
    previous = step.at;
  }
  if (terminal && (run.steps.at(-1)?.phase !== run.state || run.steps.at(-1)?.at !== run.updatedAt))
    invalidWire();
  if (
    run.result &&
    (!sameAskInputs(run.originalInputs, run.result.inputs) ||
      run.result.computedAt < run.decision!.decidedAt ||
      run.result.computedAt > run.updatedAt)
  )
    invalidWire();
  return run;
}
export function parseAskLiveThread(value: unknown): AskLiveThread {
  const thread = parseWire<AskLiveThread>(
    value,
    wireObject({
      basis: wireEnum(['structured-price-v1', 'text-price-v1', 'mixed-price-v1']),
      id: wireUuid,
      principalId: wireNull,
      runs: wireArray(liveRunWire),
    }),
  );
  if (new Set(thread.runs.map((run) => run.id)).size !== thread.runs.length) invalidWire();
  const bases = new Set(thread.runs.map((run) => run.basis));
  if (
    thread.runs.length &&
    thread.basis !== (bases.size > 1 ? 'mixed-price-v1' : thread.runs[0]!.basis)
  )
    invalidWire();
  let previous = '';
  for (const run of thread.runs) {
    parseAskLiveRun(run);
    if (run.threadId !== thread.id || run.createdAt < previous) invalidWire();
    previous = run.createdAt;
  }
  return thread;
}
export function parseAskLiveEvent(value: unknown): AskLiveEvent {
  const event = parseWire<AskLiveEvent>(
    value,
    wireObject({
      version: wireEnum([1]),
      id: wirePattern(/^[0-9a-f-]{36}:v1:[1-9][0-9]*$/),
      runId: wireUuid,
      sequence: wireNumber(1, 100000, true),
      event: wireEnum(['ask.progress', 'ask.completed', 'ask.failed']),
      terminal: wireBoolean,
      run: liveRunWire,
    }),
  );
  parseAskLiveRun(event.run);
  if (
    event.run.id !== event.runId ||
    event.id !== `${event.runId}:v1:${event.sequence}` ||
    event.terminal !== (event.run.terminal !== null) ||
    event.event !== (event.terminal ? `ask.${event.run.state}` : 'ask.progress')
  )
    invalidWire();
  return event;
}
export function parseAskClaim(value: unknown): AskClaim {
  if (typeof value !== 'object' || value === null || !('disposition' in value)) invalidWire();
  if (value.disposition === 'busy')
    return parseWire(
      value,
      wireObject({
        disposition: wireEnum(['busy']),
        identity: requestedIdentityWire,
        retryAfterMs: wireNumber(1, 30000, true),
      }),
    );
  if (value.disposition === 'terminal') {
    const result = parseWire<Extract<AskClaim, { disposition: 'terminal' }>>(
      value,
      wireObject({
        disposition: wireEnum(['terminal']),
        identity: requestedIdentityWire,
        run: liveRunWire,
      }),
    );
    parseAskLiveRun(result.run);
    if (
      !result.run.terminal ||
      result.identity.runId !== result.run.id ||
      result.identity.threadId !== result.run.threadId
    )
      invalidWire();
    return result;
  }
  const result = parseWire<Extract<AskClaim, { disposition: 'claimed' }>>(
    value,
    wireObject({
      disposition: wireEnum(['claimed']),
      identity: requestedIdentityWire,
      input: priceExecutionWire,
      expiresAt: wireDate,
    }),
  );
  if (!sameAskIdentity(result.identity, result.input)) invalidWire();
  return result;
}
export function parseAskCompletion(value: unknown): AskCompletion {
  const result = parseWire<AskCompletion>(
    value,
    wireObject({
      ...identityFields,
      executionId: wireUuid,
      evidence: wireNullable(priceEvidenceWire),
      failure: wireNullable(wireEnum(['execution_unavailable'])),
    }),
  );
  if ((result.evidence === null) === (result.failure === null)) invalidWire();
  if (result.evidence) {
    if (result.evidence.step === 'text-price-v1') parseTextExecutionEvidence(result.evidence);
    else parseStructuredExecutionEvidence(result.evidence);
    if (
      !sameAskIdentity(result, result.evidence) ||
      result.executionId !== result.evidence.executionId
    )
      invalidWire();
  }
  return result;
}
