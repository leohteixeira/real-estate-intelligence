import {
  invalidWire,
  parseWire,
  wireArray,
  wireBoolean,
  wireDate,
  wireDiscriminated,
  wireEnum,
  wireMoney,
  wireNullable,
  wireNumber,
  wireObject,
  wirePattern,
  wireSlug,
  type WireValidator,
} from '../shared/wire.js';
import {
  ASK_STATES,
  type AskAvailability,
  type AskFixtureCatalogue,
  type AskFixtureGrant,
  type AskInputs,
  type AskRun,
  type AskThread,
} from './ask.read.types.js';

export const askQueryWire: WireValidator = (value) => {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 16000) invalidWire();
};
export const askCapabilityWire: WireValidator = (value) => {
  wirePattern(/^[a-zA-Z0-9_-]{16,128}$/)(value);
  if ((value as string).trim() !== value) invalidWire();
};
export const askIdWire: WireValidator = (value) => {
  wirePattern(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)(value);
  if ((value as string).length !== 36) invalidWire();
};
export const askInputsWire = wireObject({
  priceMinorUnits: wireMoney,
  currency: wireEnum(['BRL']),
  areaSquareMeters: wireNumber(Number.MIN_VALUE, 1000000),
});
export const askMetadataWire = wireObject({
  fixtureVersion: wireEnum(['ask-v1']),
  asOf: wireDate,
  synthetic: wireEnum([true]),
  liveExecution: wireEnum([false]),
  durableReplay: wireEnum([false]),
});
export const askBaseWire = { basis: wireEnum(['prepared-ask-example']), metadata: askMetadataWire };
const decisionWire = wireObject({
  intent: wireEnum(['price_per_square_meter', 'unavailable']),
  confidence: wireNumber(0, 1),
  degraded: wireBoolean,
  requiresConfirmation: wireBoolean,
  source: wireEnum(['synthetic-fixture']),
  decidedAt: wireDate,
});
const confirmationWire = wireObject({
  intent: wireEnum(['price_per_square_meter']),
  inputs: askInputsWire,
  confirmedAt: wireDate,
  source: wireEnum(['recorded-synthetic']),
});
const resultWire = wireDiscriminated('kind', {
  price_per_square_meter: wireObject({
    kind: wireEnum(['price_per_square_meter']),
    minorUnits: wireMoney,
    currency: wireEnum(['BRL']),
    areaUnit: wireEnum(['m2']),
    inputs: askInputsWire,
    computedAt: wireDate,
  }),
  unavailable_intent: wireObject({
    kind: wireEnum(['unavailable_intent']),
    reason: wireEnum(['not_available']),
  }),
});
export const askRunWire = wireObject({
  ...askBaseWire,
  id: askIdWire,
  threadId: askIdWire,
  principalId: wireNullable(askIdWire),
  question: askQueryWire,
  locale: wireEnum(['en', 'pt-BR']),
  placeId: wireNullable(wireSlug),
  createdAt: wireDate,
  updatedAt: wireDate,
  state: wireEnum(ASK_STATES),
  originalInputs: wireNullable(askInputsWire),
  decision: wireNullable(decisionWire),
  confirmation: wireNullable(confirmationWire),
  result: wireNullable(resultWire),
  terminal: wireNullable(
    wireObject({
      state: wireEnum(['completed', 'failed', 'cancelled', 'expired']),
      reason: wireNullable(
        wireEnum([
          'fixture_failure',
          'preview_unavailable',
          'visitor_cancelled',
          'confirmation_expired',
        ]),
      ),
      at: wireDate,
    }),
  ),
  steps: wireArray(
    wireObject({
      sequence: wireNumber(1, 100, true),
      phase: wireEnum([
        'interpreting',
        'awaiting_confirmation',
        'confirmed',
        'calculating',
        'completed',
        'failed',
        'cancelled',
        'expired',
      ]),
      at: wireDate,
    }),
  ),
});
function sameInputs(a: AskInputs, b: AskInputs): boolean {
  return (
    a.priceMinorUnits === b.priceMinorUnits &&
    a.currency === b.currency &&
    a.areaSquareMeters === b.areaSquareMeters
  );
}
/** Wire semantics validate relationships; domain calculations are never reproduced here. */
export function validateAskRun(run: AskRun): void {
  const terminal = ['completed', 'failed', 'cancelled', 'expired'].includes(run.state);
  if (
    run.createdAt > run.updatedAt ||
    run.updatedAt > run.metadata.asOf ||
    terminal !== (run.terminal !== null) ||
    (run.state === 'completed') !== (run.result !== null) ||
    run.steps.length > 100
  )
    invalidWire();
  if (run.terminal) {
    const reason = run.terminal.reason;
    if (
      run.terminal.state !== run.state ||
      run.terminal.at !== run.updatedAt ||
      (run.state === 'completed' && reason !== null) ||
      (run.state === 'failed' &&
        !['fixture_failure', 'preview_unavailable'].includes(reason ?? '')) ||
      (run.state === 'cancelled' && reason !== 'visitor_cancelled') ||
      (run.state === 'expired' && reason !== 'confirmation_expired')
    )
      invalidWire();
  }
  let previous = run.createdAt;
  for (const [index, step] of run.steps.entries()) {
    if (
      step.sequence !== index + 1 ||
      step.at < previous ||
      step.at > run.updatedAt ||
      (['completed', 'failed', 'cancelled', 'expired'].includes(step.phase) &&
        (index !== run.steps.length - 1 || step.phase !== run.state)) ||
      (step.phase === 'calculating' &&
        (run.decision?.intent !== 'price_per_square_meter' ||
          step.at < run.decision.decidedAt ||
          (run.decision.requiresConfirmation &&
            (!run.confirmation || step.at < run.confirmation.confirmedAt)))) ||
      (step.phase === 'awaiting_confirmation' &&
        (!run.decision?.requiresConfirmation || step.at < run.decision.decidedAt))
    )
      invalidWire();
    previous = step.at;
  }
  const last = run.steps.at(-1);
  if (
    (terminal && (!last || last.phase !== run.state || last.at !== run.updatedAt)) ||
    (run.state === 'queued' &&
      (run.steps.length > 0 || run.decision !== null || run.confirmation !== null)) ||
    (run.state === 'awaiting_confirmation' &&
      (last?.phase !== 'awaiting_confirmation' ||
        !run.decision?.requiresConfirmation ||
        run.confirmation !== null))
  )
    invalidWire();
  if (run.decision) {
    const decision = run.decision;
    if (
      decision.decidedAt < run.createdAt ||
      decision.decidedAt > run.updatedAt ||
      decision.requiresConfirmation !==
        (decision.intent === 'price_per_square_meter' &&
          (decision.degraded || decision.confidence < 0.85))
    )
      invalidWire();
  }
  if (run.confirmation) {
    const confirmation = run.confirmation;
    const pause = run.steps.find((step) => step.phase === 'awaiting_confirmation');
    const recorded = run.steps.find((step) => step.phase === 'confirmed');
    if (
      run.decision?.intent !== confirmation.intent ||
      !run.decision.requiresConfirmation ||
      run.originalInputs === null ||
      !pause ||
      !recorded ||
      pause.at < run.decision.decidedAt ||
      pause.at > confirmation.confirmedAt ||
      recorded.at !== confirmation.confirmedAt ||
      confirmation.confirmedAt < run.decision.decidedAt ||
      confirmation.confirmedAt > run.updatedAt
    )
      invalidWire();
  } else if (run.steps.some((step) => step.phase === 'confirmed')) invalidWire();
  if (run.result?.kind === 'price_per_square_meter') {
    const result = run.result;
    const selected = run.confirmation?.inputs ?? run.originalInputs;
    if (
      run.decision?.intent !== 'price_per_square_meter' ||
      !selected ||
      !sameInputs(run.result.inputs, selected) ||
      (run.decision.requiresConfirmation && run.confirmation === null) ||
      run.result.computedAt < (run.confirmation?.confirmedAt ?? run.decision.decidedAt) ||
      run.result.computedAt > run.updatedAt ||
      !run.steps.some(
        (step) =>
          step.phase === 'calculating' &&
          step.at >= (run.confirmation?.confirmedAt ?? run.decision!.decidedAt) &&
          step.at <= result.computedAt,
      )
    )
      invalidWire();
  } else if (
    run.result?.kind === 'unavailable_intent' &&
    (run.decision?.intent !== 'unavailable' || run.confirmation !== null)
  )
    invalidWire();
}
export function parseAskInputs(value: unknown): AskInputs {
  return parseWire(value, askInputsWire);
}
export function parseAskRun(value: unknown): AskRun {
  const run = parseWire<AskRun>(value, askRunWire);
  validateAskRun(run);
  return run;
}
export function parseAskThread(value: unknown): AskThread {
  const thread = parseWire<AskThread>(
    value,
    wireObject({
      ...askBaseWire,
      id: askIdWire,
      principalId: wireNullable(askIdWire),
      runs: wireArray(askRunWire),
    }),
  );
  if (!thread.runs.length || new Set(thread.runs.map((run) => run.id)).size !== thread.runs.length)
    invalidWire();
  let previous: string | null = null;
  for (const run of thread.runs) {
    validateAskRun(run);
    if (
      run.threadId !== thread.id ||
      run.principalId !== thread.principalId ||
      run.metadata.asOf !== thread.metadata.asOf ||
      (previous !== null && run.createdAt <= previous)
    )
      invalidWire();
    previous = run.createdAt;
  }
  return thread;
}
export function parseAskAvailability(value: unknown): AskAvailability {
  const result = parseWire<AskAvailability>(
    value,
    wireObject({
      ...askBaseWire,
      mode: wireEnum(['prepared-fixtures']),
      commandHandlers: wireEnum([false]),
      intents: wireArray(
        wireObject({
          intent: wireEnum(['price_per_square_meter', 'unavailable']),
          available: wireBoolean,
        }),
      ),
    }),
  );
  if (
    result.intents.length !== 2 ||
    result.intents[0]?.intent !== 'price_per_square_meter' ||
    result.intents[0].available !== true ||
    result.intents[1]?.intent !== 'unavailable' ||
    result.intents[1].available !== false
  )
    invalidWire();
  return result;
}
export const askGrantWire = wireObject({
  scope: wireEnum(['synthetic-fixture']),
  capability: askCapabilityWire,
});
export function parseAskFixtureGrant(value: unknown): AskFixtureGrant {
  return parseWire(value, askGrantWire);
}
export function parseAskFixtureCatalogue(value: unknown): AskFixtureCatalogue {
  const catalogue = parseWire<AskFixtureCatalogue>(
    value,
    wireObject({
      ...askBaseWire,
      items: wireArray(
        wireObject({
          runId: askIdWire,
          threadId: askIdWire,
          state: wireEnum(ASK_STATES),
          grant: askGrantWire,
        }),
      ),
    }),
  );
  if (
    catalogue.items.length !== ASK_STATES.length ||
    new Set(catalogue.items.map((item) => item.runId)).size !== ASK_STATES.length ||
    new Set(catalogue.items.map((item) => item.threadId)).size !== ASK_STATES.length ||
    catalogue.items.some((item, index) => item.state !== ASK_STATES[index])
  )
    invalidWire();
  return catalogue;
}
