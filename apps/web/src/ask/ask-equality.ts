import type {
  AskConfirmation,
  AskDecision,
  AskInputs,
  AskRun,
  AskResult,
  AskStep,
} from '@rei/contracts';

function sameInputs(a: AskInputs | null, b: AskInputs | null): boolean {
  return (
    a === b ||
    (a !== null &&
      b !== null &&
      a.priceMinorUnits === b.priceMinorUnits &&
      a.currency === b.currency &&
      a.areaSquareMeters === b.areaSquareMeters)
  );
}
export function sameDecision(a: AskDecision | null, b: AskDecision | null): boolean {
  return (
    a === b ||
    (a !== null &&
      b !== null &&
      a.intent === b.intent &&
      a.confidence === b.confidence &&
      a.degraded === b.degraded &&
      a.requiresConfirmation === b.requiresConfirmation &&
      a.source === b.source &&
      a.decidedAt === b.decidedAt)
  );
}
export function sameConfirmation(a: AskConfirmation | null, b: AskConfirmation | null): boolean {
  return (
    a === b ||
    (a !== null &&
      b !== null &&
      a.intent === b.intent &&
      sameInputs(a.inputs, b.inputs) &&
      a.confirmedAt === b.confirmedAt &&
      a.source === b.source)
  );
}
export function sameStep(a: AskStep, b: AskStep | undefined): boolean {
  return b !== undefined && a.sequence === b.sequence && a.phase === b.phase && a.at === b.at;
}
export function sameIdentity(a: AskRun, b: AskRun): boolean {
  return (
    a.id === b.id &&
    a.threadId === b.threadId &&
    a.principalId === b.principalId &&
    a.question === b.question &&
    a.locale === b.locale &&
    a.placeId === b.placeId &&
    sameInputs(a.originalInputs, b.originalInputs) &&
    a.createdAt === b.createdAt &&
    a.basis === b.basis &&
    a.metadata.fixtureVersion === b.metadata.fixtureVersion &&
    a.metadata.asOf === b.metadata.asOf &&
    a.metadata.synthetic === b.metadata.synthetic &&
    a.metadata.liveExecution === b.metadata.liveExecution &&
    a.metadata.durableReplay === b.metadata.durableReplay
  );
}
function sameResult(a: AskResult | null, b: AskResult | null): boolean {
  if (a === b) return true;
  if (a?.kind === 'price_per_square_meter' && b?.kind === 'price_per_square_meter')
    return (
      a.minorUnits === b.minorUnits &&
      a.currency === b.currency &&
      a.areaUnit === b.areaUnit &&
      sameInputs(a.inputs, b.inputs) &&
      a.computedAt === b.computedAt
    );
  return (
    a?.kind === 'unavailable_intent' && b?.kind === 'unavailable_intent' && a.reason === b.reason
  );
}
/** Compare validated facts, independently of the JSON object's member insertion order. */
export function sameAskRun(a: AskRun | undefined, b: AskRun): boolean {
  return (
    a !== undefined &&
    sameIdentity(a, b) &&
    a.state === b.state &&
    a.updatedAt === b.updatedAt &&
    sameDecision(a.decision, b.decision) &&
    sameConfirmation(a.confirmation, b.confirmation) &&
    sameResult(a.result, b.result) &&
    (a.terminal === b.terminal ||
      (a.terminal !== null &&
        b.terminal !== null &&
        a.terminal.state === b.terminal.state &&
        a.terminal.reason === b.terminal.reason &&
        a.terminal.at === b.terminal.at)) &&
    a.steps.length === b.steps.length &&
    a.steps.every((step, index) => sameStep(step, b.steps[index]))
  );
}
