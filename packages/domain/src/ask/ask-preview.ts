import type { AskProgressEvent, AskTerminalState } from './ask-read.types.js';

export function isAskTerminal(state: string): state is AskTerminalState {
  return ['completed', 'failed', 'cancelled', 'expired'].includes(state);
}
export function askEventId(runId: string, sequence: number): string {
  return `${runId}:v1:${sequence}`;
}
/** A full fixture preview starts at its snapshot and ends at exactly one explicit terminal. */
export function assertAskPreview(events: readonly AskProgressEvent[]): void {
  const invalid = () => {
    throw new TypeError('Invalid Ask preview.');
  };
  if (events.length === 0) invalid();
  const first = events[0]!;
  let previous = first.run.state;
  const transitions: Readonly<Record<string, readonly string[]>> = {
    queued: ['running'],
    running: ['awaiting_confirmation', 'completed', 'failed'],
    awaiting_confirmation: ['running', 'expired', 'cancelled'],
  };
  for (const [index, frame] of events.entries()) {
    const terminal = isAskTerminal(frame.run.state);
    const previousConfirmation = index > 0 ? events[index - 1]!.run.confirmation : null;
    if (
      frame.runId !== first.runId ||
      frame.run.id !== frame.runId ||
      frame.sequence !== index + 1 ||
      frame.id !== askEventId(frame.runId, frame.sequence) ||
      frame.version !== 1 ||
      frame.terminal !== terminal ||
      frame.run.threadId !== first.run.threadId ||
      frame.run.question !== first.run.question ||
      frame.run.createdAt !== first.run.createdAt ||
      frame.run.locale !== first.run.locale ||
      frame.run.principalId !== first.run.principalId ||
      frame.run.placeId !== first.run.placeId ||
      frame.run.originalInputs?.priceMinorUnits !== first.run.originalInputs?.priceMinorUnits ||
      frame.run.originalInputs?.currency !== first.run.originalInputs?.currency ||
      frame.run.originalInputs?.areaSquareMeters !== first.run.originalInputs?.areaSquareMeters ||
      frame.metadata.fixtureVersion !== first.metadata.fixtureVersion ||
      frame.metadata.asOf !== first.metadata.asOf ||
      frame.run.metadata.asOf !== first.metadata.asOf ||
      terminal !== (frame.run.terminal !== null) ||
      (frame.run.state === 'completed') !== (frame.run.result !== null) ||
      frame.event !== (terminal ? `ask.${frame.run.state}` : 'ask.progress') ||
      terminal !== (index === events.length - 1) ||
      (index > 0 && !transitions[previous]?.includes(frame.run.state)) ||
      (index > 0 && frame.run.updatedAt < events[index - 1]!.run.updatedAt) ||
      (frame.run.state === 'awaiting_confirmation' &&
        (frame.run.result !== null || frame.run.confirmation !== null)) ||
      (frame.run.result?.kind === 'price_per_square_meter' &&
        frame.run.decision?.requiresConfirmation &&
        frame.run.confirmation === null) ||
      (previousConfirmation !== null &&
        (frame.run.confirmation?.confirmedAt !== previousConfirmation.confirmedAt ||
          frame.run.confirmation?.intent !== previousConfirmation.intent ||
          frame.run.confirmation?.source !== previousConfirmation.source ||
          frame.run.confirmation?.inputs.priceMinorUnits !==
            previousConfirmation.inputs.priceMinorUnits ||
          frame.run.confirmation?.inputs.currency !== previousConfirmation.inputs.currency ||
          frame.run.confirmation?.inputs.areaSquareMeters !==
            previousConfirmation.inputs.areaSquareMeters))
    )
      invalid();
    previous = frame.run.state;
  }
}
