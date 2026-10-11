import type { AskFixtureReadPort } from '@rei/application';
import {
  ASK_STATES,
  askEventId,
  assertAskPreview,
  isAskTerminal,
  pricePerSquareMeter,
  type AskAvailability,
  type AskFixtureCatalogue,
  type AskInputs,
  type AskMetadata,
  type AskProgressEvent,
  type AskRun,
  type AskState,
  type AskThread,
} from '@rei/domain';

export const SYNTHETIC_ASK_METADATA: AskMetadata = {
  fixtureVersion: 'ask-v1',
  asOf: '2026-10-11T12:00:10.000Z',
  synthetic: true,
  liveExecution: false,
  durableReplay: false,
};
const id = (n: number) => `0199c8f2-2394-7000-8000-${String(n).padStart(12, '0')}`;
const time = (n: number) => `2026-10-11T12:00:${String(n).padStart(2, '0')}.000Z`;
const original: AskInputs = { priceMinorUnits: 80000000, currency: 'BRL', areaSquareMeters: 80 };
const edited: AskInputs = { priceMinorUnits: 81000000, currency: 'BRL', areaSquareMeters: 90 };
const base = { basis: 'prepared-ask-example' as const, metadata: SYNTHETIC_ASK_METADATA };

function queued(runId: string, threadId: string, createdAt = time(0)): AskRun {
  return {
    ...base,
    id: runId,
    threadId,
    principalId: null,
    question: 'What is the asking price per square meter for this synthetic apartment?',
    locale: 'en',
    placeId: 'sao-paulo-pinheiros',
    createdAt,
    updatedAt: createdAt,
    state: 'queued',
    originalInputs: original,
    decision: null,
    confirmation: null,
    result: null,
    terminal: null,
    steps: [],
  };
}
function phase(run: AskRun, state: AskState, second: number, lowConfidence = false): AskRun {
  const at = time(second);
  const step = (name: AskRun['steps'][number]['phase']) => ({
    sequence: run.steps.length + 1,
    phase: name,
    at,
  });
  if (state === 'running') {
    if (run.state === 'awaiting_confirmation')
      return {
        ...run,
        state,
        updatedAt: at,
        confirmation: {
          intent: 'price_per_square_meter',
          inputs: edited,
          source: 'recorded-synthetic',
          confirmedAt: at,
        },
        steps: [...run.steps, step('confirmed')],
      };
    return { ...run, state, updatedAt: at, steps: [...run.steps, step('interpreting')] };
  }
  if (state === 'awaiting_confirmation')
    return {
      ...run,
      state,
      updatedAt: at,
      decision: {
        intent: 'price_per_square_meter',
        confidence: 0.64,
        degraded: true,
        requiresConfirmation: true,
        source: 'synthetic-fixture',
        decidedAt: at,
      },
      steps: [...run.steps, step('awaiting_confirmation')],
    };
  if (state === 'completed') {
    const inputs = run.confirmation?.inputs ?? original;
    const calculating = { sequence: run.steps.length + 1, phase: 'calculating' as const, at };
    const completed = { sequence: run.steps.length + 2, phase: 'completed' as const, at };
    return {
      ...run,
      state,
      updatedAt: at,
      decision: run.decision ?? {
        intent: 'price_per_square_meter',
        confidence: lowConfidence ? 0.64 : 0.98,
        degraded: lowConfidence,
        requiresConfirmation: lowConfidence,
        source: 'synthetic-fixture',
        decidedAt: at,
      },
      result: {
        kind: 'price_per_square_meter',
        minorUnits: pricePerSquareMeter({
          priceInCents: inputs.priceMinorUnits,
          areaInSquareMeters: inputs.areaSquareMeters,
        }),
        currency: 'BRL',
        areaUnit: 'm2',
        inputs,
        computedAt: at,
      },
      terminal: { state, reason: null, at },
      steps: [...run.steps, calculating, completed],
    };
  }
  if (state === 'failed' || state === 'cancelled' || state === 'expired')
    return {
      ...run,
      state,
      updatedAt: at,
      terminal: {
        state,
        reason:
          state === 'failed'
            ? 'fixture_failure'
            : state === 'cancelled'
              ? 'visitor_cancelled'
              : 'confirmation_expired',
        at,
      },
      steps: [...run.steps, step(state)],
    };
  return run;
}
function event(run: AskRun, sequence: number): AskProgressEvent {
  const terminal = isAskTerminal(run.state);
  return {
    ...base,
    version: 1,
    id: askEventId(run.id, sequence),
    runId: run.id,
    sequence,
    event: terminal ? `ask.${run.state}` : 'ask.progress',
    terminal,
    run,
  };
}
function fixture(state: AskState, index: number) {
  const runId = id(index + 1),
    threadId = id(index + 101);
  let run = queued(runId, threadId);
  const running = phase(run, 'running', 1);
  const pause = phase(running, 'awaiting_confirmation', 2);
  if (state === 'running') run = running;
  else if (state === 'awaiting_confirmation') run = pause;
  else if (state === 'completed') run = phase(running, 'completed', 2);
  else if (state === 'failed') run = phase(running, 'failed', 2);
  else if (state === 'cancelled' || state === 'expired') run = phase(pause, state, 3);
  const path: AskRun[] = [run];
  if (state === 'queued') path.push(running, phase(running, 'completed', 2));
  else if (state === 'running') path.push(phase(running, 'completed', 2));
  else if (state === 'awaiting_confirmation') {
    const confirmed = phase(pause, 'running', 3);
    path.push(confirmed, phase(confirmed, 'completed', 4, true));
  }
  const frames = path.map((item, position) => event(item, position + 1));
  assertAskPreview(frames);
  // Earlier complete run demonstrates a full ordered thread and unavailable intent.
  const priorTime = '2026-10-11T11:59:00.000Z';
  const prior: AskRun = {
    ...queued(id(index + 201), threadId, priorTime),
    question: 'Can this fixture predict a future sale price?',
    updatedAt: '2026-10-11T11:59:01.000Z',
    state: 'completed',
    originalInputs: null,
    decision: {
      intent: 'unavailable',
      confidence: 0.99,
      degraded: false,
      requiresConfirmation: false,
      source: 'synthetic-fixture',
      decidedAt: priorTime,
    },
    result: { kind: 'unavailable_intent', reason: 'not_available' },
    terminal: { state: 'completed', reason: null, at: '2026-10-11T11:59:01.000Z' },
    steps: [{ sequence: 1, phase: 'completed', at: '2026-10-11T11:59:01.000Z' }],
  };
  const thread: AskThread = { ...base, id: threadId, principalId: null, runs: [prior, run] };
  return { run, prior, thread, frames, capability: `ask-fixture-v1-${state}` };
}

/** Static synthetic authority; detached values only, with no database, network or caller writes. */
export class SyntheticAskAdapter implements AskFixtureReadPort {
  private readonly fixtures = ASK_STATES.map(fixture);
  public async availability(): Promise<AskAvailability> {
    return structuredClone({
      ...base,
      mode: 'prepared-fixtures',
      commandHandlers: false,
      intents: [
        { intent: 'price_per_square_meter', available: true },
        { intent: 'unavailable', available: false },
      ],
    });
  }
  public async catalogue(): Promise<AskFixtureCatalogue> {
    return structuredClone({
      ...base,
      items: this.fixtures.map(({ run, capability }) => ({
        runId: run.id,
        threadId: run.threadId,
        state: run.state,
        grant: { scope: 'synthetic-fixture', capability },
      })),
    });
  }
  public async capabilityFor(kind: 'run' | 'thread', identifier: string): Promise<string | null> {
    return (
      this.fixtures.find((fixture) =>
        kind === 'run'
          ? fixture.run.id === identifier || fixture.prior.id === identifier
          : fixture.thread.id === identifier,
      )?.capability ?? null
    );
  }
  public async run(identifier: string): Promise<AskRun | null> {
    const fixture = this.fixtures.find(
      (fixture) => fixture.run.id === identifier || fixture.prior.id === identifier,
    );
    return structuredClone(
      fixture ? (fixture.run.id === identifier ? fixture.run : fixture.prior) : null,
    );
  }
  public async thread(identifier: string): Promise<AskThread | null> {
    return structuredClone(
      this.fixtures.find((fixture) => fixture.thread.id === identifier)?.thread ?? null,
    );
  }
  public async preview(identifier: string): Promise<readonly AskProgressEvent[] | null> {
    const fixture = this.fixtures.find(
      (fixture) => fixture.run.id === identifier || fixture.prior.id === identifier,
    );
    return structuredClone(
      fixture ? (fixture.run.id === identifier ? fixture.frames : [event(fixture.prior, 1)]) : null,
    );
  }
}
