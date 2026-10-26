import {
  invalidWire,
  parseWire,
  wireArray,
  wireBoolean,
  wireDate,
  wireDiscriminated,
  wireEnum,
  wireNullable,
  wireNull,
  wireNumber,
  wireObject,
  wirePattern,
  wireSlug,
  wireUuid,
  type WireValidator,
} from '../shared/wire.js';
import { askInputsWire, askQueryWire } from './ask.read.dto.js';
import {
  parsePriceToolReceipt,
  priceResultWire,
  sameAskInputs,
  sameAskIdentity,
} from './ask-live.dto.js';
import {
  askIntents,
  type RoutedAskConfirmation,
  type IntentDecision,
  type IntentDecisionReceipt,
  type IntentDecisionRequest,
  type IntentDecisionResponse,
  type RoutedAskCreate,
  type RoutedAskAccepted,
  type RoutedAskLiveRun,
  type RoutedExecutionEvidence,
  type RoutedExecutionInput,
} from './intent-decision.types.js';
const decisionFields = {
  intent: wireEnum(askIntents),
  probability: wireNumber(0, 1),
  probabilities: wireObject(
    Object.fromEntries(askIntents.map((intent) => [intent, wireNumber(0, 1)])),
  ),
  source: wireEnum(['gateway-jev-v1', 'heuristic-v1']),
  degraded: wireBoolean,
  taxonomyVersion: wireEnum(['ask-intents-v1']),
  privacyEvidenceId: wireNullable(wirePattern(/^[A-Za-z0-9_-]{16,128}$/)),
};
export function parseIntentDecision(value: unknown): IntentDecision {
  const result = parseWire<IntentDecision>(value, wireObject(decisionFields));
  if (
    Math.abs(Object.values(result.probabilities).reduce((a, b) => a + b, 0) - 1) > 0.000001 ||
    result.probability !== result.probabilities[result.intent] ||
    result.degraded !== (result.source === 'heuristic-v1') ||
    (result.source === 'gateway-jev-v1') !== (result.privacyEvidenceId !== null)
  )
    invalidWire();
  return result;
}
export const intentDecisionWire: WireValidator = (value) => {
  parseIntentDecision(value);
};
export function parseIntentDecisionReceipt(value: unknown): IntentDecisionReceipt {
  const result = parseWire<IntentDecisionReceipt>(
    value,
    wireObject({ ...decisionFields, receiptId: wireUuid, acceptedAt: wireDate }),
  );
  const { receiptId, acceptedAt, ...decision } = result;
  void receiptId;
  void acceptedAt;
  parseIntentDecision(decision);
  return result;
}
const receiptWire: WireValidator = (value) => {
  parseIntentDecisionReceipt(value);
};
const identity = { version: wireEnum([1]), eventId: wireUuid, runId: wireUuid, threadId: wireUuid };
const confirmationWire = wireObject({
  decisionReceiptId: wireUuid,
  inputs: wireNullable(askInputsWire),
  at: wireDate,
});
const queryWire: WireValidator = (value) => {
  askQueryWire(value);
  if (
    typeof value !== 'string' ||
    Array.from(value).some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  )
    invalidWire();
};
export function parseRoutedAskCreate(value: unknown): RoutedAskCreate {
  return parseWire(
    value,
    wireObject({
      mode: wireEnum(['routed-text-v1']),
      threadId: wireNullable(wireUuid),
      placeId: wireNullable(wireSlug),
      query: queryWire,
      locale: wireEnum(['en', 'pt-BR']),
    }),
  );
}
export function parseRoutedAskAccepted(value: unknown): RoutedAskAccepted {
  return parseWire(
    value,
    wireObject({
      mode: wireEnum(['routed-text-v1']),
      runId: wireUuid,
      threadId: wireUuid,
      state: wireEnum(['queued']),
    }),
  );
}
export function parseRoutedAskConfirmation(value: unknown): RoutedAskConfirmation {
  return parseWire(
    value,
    wireObject({
      runId: wireUuid,
      decisionReceiptId: wireUuid,
      inputs: wireNullable(askInputsWire),
    }),
  );
}
export const routedLiveRunWire = wireObject({
  basis: wireEnum(['routed-text-v1']),
  id: wireUuid,
  threadId: wireUuid,
  principalId: wireNull,
  question: queryWire,
  locale: wireEnum(['en', 'pt-BR']),
  placeId: wireNullable(wireSlug),
  createdAt: wireDate,
  updatedAt: wireDate,
  state: wireEnum([
    'queued',
    'running',
    'awaiting_confirmation',
    'completed',
    'failed',
    'expired',
    'cancelled',
  ]),
  originalInputs: wireNullable(askInputsWire),
  decision: wireNullable(receiptWire),
  confirmation: wireNullable(confirmationWire),
  confirmationDeadline: wireNullable(wireDate),
  result: wireNullable(
    wireDiscriminated('kind', {
      price_per_square_meter: priceResultWire,
      unavailable_intent: wireObject({
        kind: wireEnum(['unavailable_intent']),
        intent: wireEnum(askIntents.filter((intent) => intent !== 'price_per_square_meter')),
        reason: wireEnum(['not_available']),
      }),
    }),
  ),
  terminal: wireNullable(
    wireObject({
      state: wireEnum(['completed', 'failed', 'expired', 'cancelled']),
      reason: wireNullable(
        wireEnum([
          'execution_unavailable',
          'queue_expired',
          'confirmation_expired',
          'visitor_cancelled',
        ]),
      ),
      at: wireDate,
    }),
  ),
  steps: wireArray(
    wireObject({
      sequence: wireNumber(1, 100, true),
      phase: wireEnum([
        'routing',
        'awaiting_confirmation',
        'confirmed',
        'completed',
        'failed',
        'expired',
        'cancelled',
      ]),
      at: wireDate,
    }),
  ),
});
export function parseRoutedAskLiveRun(value: unknown): RoutedAskLiveRun {
  const run = parseWire<RoutedAskLiveRun>(value, routedLiveRunWire);
  const terminal = ['completed', 'failed', 'expired', 'cancelled'].includes(run.state);
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
      run.terminal.reason !==
        (run.state === 'completed'
          ? null
          : run.state === 'failed'
            ? 'execution_unavailable'
            : run.state === 'cancelled'
              ? 'visitor_cancelled'
              : run.decision
                ? 'confirmation_expired'
                : 'queue_expired'))
  )
    invalidWire();
  if (
    run.decision &&
    (run.decision.acceptedAt < run.createdAt || run.decision.acceptedAt > run.updatedAt)
  )
    invalidWire();
  if (
    run.state === 'awaiting_confirmation' &&
    (!run.decision ||
      run.decision.probability >= 0.85 ||
      run.confirmation ||
      !run.confirmationDeadline)
  )
    invalidWire();
  if (
    run.confirmationDeadline &&
    (!run.decision || run.decision.probability >= 0.85 || run.confirmationDeadline <= run.createdAt)
  )
    invalidWire();
  const firstPause = run.steps.find((step) => step.phase === 'awaiting_confirmation');
  if (
    (firstPause !== undefined) !== (run.confirmationDeadline !== null) ||
    (firstPause && Date.parse(firstPause.at) + 600000 !== Date.parse(run.confirmationDeadline!))
  )
    invalidWire();
  if (
    run.confirmation &&
    (!run.decision ||
      run.confirmation.decisionReceiptId !== run.decision.receiptId ||
      !run.confirmationDeadline ||
      run.confirmation.at >= run.confirmationDeadline ||
      run.confirmation.at > run.updatedAt)
  )
    invalidWire();
  if (run.result && (!run.decision || (run.decision.probability < 0.85 && !run.confirmation)))
    invalidWire();
  if (run.result?.kind === 'unavailable_intent' && run.result.intent !== run.decision?.intent)
    invalidWire();
  if (
    run.result?.kind === 'price_per_square_meter' &&
    (!run.decision ||
      run.decision.intent !== 'price_per_square_meter' ||
      (run.decision.probability < 0.85 && !run.confirmation) ||
      !(run.confirmation ? run.confirmation.inputs : run.originalInputs) ||
      !sameAskInputs(
        run.result.inputs,
        (run.confirmation ? run.confirmation.inputs : run.originalInputs)!,
      ) ||
      run.result.computedAt < run.decision.acceptedAt ||
      run.result.computedAt > run.updatedAt)
  )
    invalidWire();
  let previous = run.createdAt;
  for (const [index, step] of run.steps.entries()) {
    if (step.sequence !== index + 1 || step.at < previous || step.at > run.updatedAt) invalidWire();
    previous = step.at;
  }
  if (terminal && (run.steps.at(-1)?.phase !== run.state || run.steps.at(-1)?.at !== run.updatedAt))
    invalidWire();
  return run;
}
export function parseRoutedExecutionInput(value: unknown): RoutedExecutionInput {
  return parseWire(
    value,
    wireObject({
      ...identity,
      step: wireEnum(['routed-text-v1']),
      query: queryWire,
      locale: wireEnum(['en', 'pt-BR']),
      executionId: wireUuid,
      toolGrant: wirePattern(/^[A-Za-z0-9_-]{43,128}$/),
      checkpointGrant: wirePattern(/^[A-Za-z0-9_-]{43,128}$/),
      inputs: wireNullable(askInputsWire),
    }),
  );
}
export const routedExecutionWire: WireValidator = (value) => {
  parseRoutedExecutionInput(value);
};
export function parseRoutedExecutionEvidence(value: unknown): RoutedExecutionEvidence {
  const isPrice =
    typeof value === 'object' &&
    value !== null &&
    'outcome' in value &&
    value.outcome === 'price-calculated';
  const result = parseWire<RoutedExecutionEvidence>(
    value,
    wireObject({
      ...identity,
      step: wireEnum(['routed-text-v1']),
      executionId: wireUuid,
      decisionReceiptId: wireUuid,
      outcome: wireEnum(
        isPrice ? ['price-calculated'] : ['awaiting-confirmation', 'execution-unavailable'],
      ),
      ...(isPrice
        ? {
            receipt: (v: unknown) => {
              parsePriceToolReceipt(v);
            },
          }
        : {}),
    }),
  );
  if (
    result.outcome === 'price-calculated' &&
    (!sameAskIdentity(result, result.receipt) || result.executionId !== result.receipt.executionId)
  )
    invalidWire();
  return result;
}
export const routedEvidenceWire: WireValidator = (value) => {
  parseRoutedExecutionEvidence(value);
};
export function parseIntentDecisionRequest(value: unknown): IntentDecisionRequest {
  if (typeof value !== 'object' || !value || !('operation' in value)) invalidWire();
  const fields = { ...identity, executionId: wireUuid };
  if (value.operation === 'get')
    return parseWire(value, wireObject({ ...fields, operation: wireEnum(['get']) }));
  if (value.operation === 'reserve')
    return parseWire(
      value,
      wireObject({
        ...fields,
        operation: wireEnum(['reserve']),
        attemptKey: wirePattern(/^[A-Za-z0-9_-]{16,128}$/),
      }),
    );
  return parseWire(
    value,
    wireObject({
      ...fields,
      operation: wireEnum(['accept']),
      reservationId: wireUuid,
      decision: intentDecisionWire,
    }),
  );
}
export function parseIntentDecisionResponse(value: unknown): IntentDecisionResponse {
  if (typeof value !== 'object' || !value || !('operation' in value)) invalidWire();
  if (value.operation === 'get')
    return parseWire(
      value,
      wireObject({
        operation: wireEnum(['get']),
        decision: wireNullable(receiptWire),
        confirmation: wireNullable(confirmationWire),
      }),
    );
  if (value.operation === 'reserve')
    return parseWire(
      value,
      wireObject({ operation: wireEnum(['reserve']), reservationId: wireUuid }),
    );
  return parseWire(value, wireObject({ operation: wireEnum(['accept']), decision: receiptWire }));
}
