import { describe, expect, it } from 'vitest';
import {
  parseAskAvailability,
  parseAskFixtureCatalogue,
  parseAskFixtureGrant,
  parseAskInputs,
  parseAskRun,
  parseAskThread,
} from './ask.read.dto.js';
import { ASK_STATES, type AskRun } from './ask.read.types.js';

const id = (n: number) => `0199c8f2-2394-7000-8000-${String(n).padStart(12, '0')}`;
const metadata = {
  fixtureVersion: 'ask-v1',
  asOf: '2026-10-11T12:00:10.000Z',
  synthetic: true,
  liveExecution: false,
  durableReplay: false,
} as const;
const original = { priceMinorUnits: 80000000, currency: 'BRL', areaSquareMeters: 80 } as const;
const edited = { priceMinorUnits: 81000000, currency: 'BRL', areaSquareMeters: 90 } as const;
const completed: AskRun = {
  basis: 'prepared-ask-example',
  metadata,
  id: id(1),
  threadId: id(2),
  principalId: null,
  question: 'Synthetic question',
  locale: 'en',
  placeId: null,
  state: 'completed',
  createdAt: '2026-10-11T12:00:00.000Z',
  updatedAt: '2026-10-11T12:00:04.000Z',
  originalInputs: original,
  decision: {
    intent: 'price_per_square_meter',
    confidence: 0.64,
    degraded: true,
    requiresConfirmation: true,
    source: 'synthetic-fixture',
    decidedAt: '2026-10-11T12:00:01.000Z',
  },
  confirmation: {
    intent: 'price_per_square_meter',
    inputs: edited,
    source: 'recorded-synthetic',
    confirmedAt: '2026-10-11T12:00:02.000Z',
  },
  result: {
    kind: 'price_per_square_meter',
    minorUnits: 900000,
    currency: 'BRL',
    areaUnit: 'm2',
    inputs: edited,
    computedAt: '2026-10-11T12:00:03.000Z',
  },
  terminal: { state: 'completed', reason: null, at: '2026-10-11T12:00:04.000Z' },
  steps: [
    { sequence: 1, phase: 'awaiting_confirmation', at: '2026-10-11T12:00:01.000Z' },
    { sequence: 2, phase: 'confirmed', at: '2026-10-11T12:00:02.000Z' },
    { sequence: 3, phase: 'calculating', at: '2026-10-11T12:00:03.000Z' },
    { sequence: 4, phase: 'completed', at: '2026-10-11T12:00:04.000Z' },
  ],
};
describe('closed Ask read shapes and semantic relationships', () => {
  it('round-trips edited confirmation without replacing immutable original inputs', () => {
    const parsed = parseAskRun(JSON.parse(JSON.stringify(completed)));
    expect(parsed).toEqual(completed);
    expect(parsed.originalInputs).not.toEqual(parsed.confirmation?.inputs);
    expect(parseAskInputs(original)).toEqual(original);
    expect(parseAskRun({ ...completed, principalId: id(99) }).principalId).toBe(id(99));
  });
  it('recursively rejects missing and extra fields in every nested run object with a fixed message', () => {
    function visit(value: unknown, path: readonly (string | number)[] = []): void {
      if (Array.isArray(value)) {
        value.forEach((item, index) => visit(item, [...path, index]));
        return;
      }
      if (typeof value !== 'object' || value === null) return;
      const object = value as Record<string, unknown>;
      for (const key of [...Object.keys(object), 'privatePayload']) {
        const copy = structuredClone(completed);
        let target: object = copy;
        for (const part of path) target = Reflect.get(target, part) as object;
        if (key === 'privatePayload') Reflect.set(target, key, 'private value');
        else Reflect.deleteProperty(target, key);
        expect(() => parseAskRun(copy)).toThrow('Invalid contract value.');
      }
      for (const [key, child] of Object.entries(object)) visit(child, [...path, key]);
    }
    visit(completed);
  });
  it('rejects wrong dates, units, identifiers, state, proposal and terminal semantics', () => {
    const mutations: Array<(run: AskRun) => void> = [
      (run) => Reflect.set(run, 'state', 'unknown'),
      (run) => Reflect.set(run, 'id', id(1).toUpperCase()),
      (run) => Reflect.set(run, 'id', `${id(1)}\n`),
      (run) => Reflect.set(run, 'updatedAt', '2026-02-30T00:00:00.000Z'),
      (run) => Reflect.set(run, 'createdAt', '2026-10-12T00:00:00.000Z'),
      (run) => Reflect.set(run.metadata, 'liveExecution', true),
      (run) => Reflect.set(run.originalInputs!, 'priceMinorUnits', Number.MAX_SAFE_INTEGER + 1),
      (run) => Reflect.set(run.originalInputs!, 'areaSquareMeters', Infinity),
      (run) => Reflect.set(run.originalInputs!, 'areaSquareMeters', 0),
      (run) => Reflect.set(run.originalInputs!, 'currency', 'USD'),
      (run) => Reflect.set(run.decision!, 'confidence', 1.1),
      (run) => Reflect.set(run.decision!, 'requiresConfirmation', false),
      (run) => Reflect.set(run.decision!, 'decidedAt', '2026-10-11T11:00:00.000Z'),
      (run) => Reflect.set(run.confirmation!, 'confirmedAt', '2026-10-11T12:00:00.000Z'),
      (run) => Reflect.set(run.confirmation!, 'intent', 'unavailable'),
      (run) => Reflect.set(run, 'confirmation', null),
      (run) => Reflect.set(run, 'originalInputs', null),
      (run) => Reflect.set(run.result!, 'inputs', original),
      (run) => Reflect.set(run.result!, 'computedAt', '2026-10-11T12:00:01.000Z'),
      (run) => Reflect.set(run.result!, 'minorUnits', 0),
      (run) => Reflect.set(run.result!, 'areaUnit', 'sqft'),
      (run) => Reflect.set(run.terminal!, 'state', 'failed'),
      (run) => Reflect.set(run.terminal!, 'reason', 'private-provider-error'),
      (run) => Reflect.set(run.terminal!, 'reason', 'fixture_failure'),
      (run) => Reflect.set(run.terminal!, 'at', run.createdAt),
      (run) => Reflect.set(run, 'terminal', null),
      (run) => Reflect.set(run.steps[0]!, 'sequence', 2),
      (run) => Reflect.set(run.steps[0]!, 'phase', 'failed'),
      (run) => Reflect.set(run.steps[2]!, 'at', run.createdAt),
      (run) => Reflect.set(run.steps[3]!, 'phase', 'calculating'),
    ];
    for (const mutate of mutations) {
      const run = structuredClone(completed);
      mutate(run);
      expect(() => parseAskRun(run)).toThrow('Invalid contract value.');
    }
  });
  it('admits a nothing-computed pause and rejects pre-confirmation results', () => {
    const pause = {
      ...completed,
      state: 'awaiting_confirmation',
      updatedAt: completed.decision!.decidedAt,
      confirmation: null,
      result: null,
      terminal: null,
      steps: completed.steps.slice(0, 1),
    };
    expect(parseAskRun(pause).state).toBe('awaiting_confirmation');
    expect(() => parseAskRun({ ...pause, result: completed.result })).toThrow(TypeError);
    expect(() => parseAskRun({ ...pause, decision: null })).toThrow(TypeError);
    expect(() => parseAskRun({ ...pause, confirmation: completed.confirmation })).toThrow(
      TypeError,
    );
    expect(() => parseAskRun({ ...pause, state: 'queued' })).toThrow(TypeError);
    expect(() =>
      parseAskRun({
        ...pause,
        state: 'running',
        steps: [...pause.steps, { sequence: 2, phase: 'calculating', at: pause.updatedAt }],
      }),
    ).toThrow(TypeError);
  });
  it('rejects every terminal final step in an otherwise nonterminal running run', () => {
    const running = {
      ...completed,
      state: 'running',
      result: null,
      terminal: null,
      steps: completed.steps.slice(0, -1),
    };
    expect(parseAskRun(running).state).toBe('running');
    for (const phase of ['completed', 'failed', 'cancelled', 'expired']) {
      expect(() =>
        parseAskRun({
          ...running,
          steps: [...running.steps, { sequence: 4, phase, at: running.updatedAt }],
        }),
      ).toThrow('Invalid contract value.');
    }
  });
  it('validates all terminal classifications and unavailable-intent outcomes', () => {
    for (const [state, reason] of [
      ['failed', 'fixture_failure'],
      ['failed', 'preview_unavailable'],
      ['cancelled', 'visitor_cancelled'],
      ['expired', 'confirmation_expired'],
    ] as const) {
      const run = {
        ...completed,
        state,
        result: null,
        terminal: { state, reason, at: completed.updatedAt },
        steps: [
          ...completed.steps.slice(0, -1),
          { sequence: 4, phase: state, at: completed.updatedAt },
        ],
      };
      expect(parseAskRun(run).state).toBe(state);
      expect(() => parseAskRun({ ...run, terminal: { ...run.terminal, reason: null } })).toThrow(
        TypeError,
      );
    }
    const unavailable = {
      ...completed,
      originalInputs: null,
      confirmation: null,
      decision: {
        ...completed.decision,
        intent: 'unavailable',
        confidence: 0.99,
        degraded: false,
        requiresConfirmation: false,
      },
      result: { kind: 'unavailable_intent', reason: 'not_available' },
      steps: [{ sequence: 1, phase: 'completed', at: completed.updatedAt }],
    };
    expect(parseAskRun(unavailable).result?.kind).toBe('unavailable_intent');
    expect(() => parseAskRun({ ...unavailable, decision: completed.decision })).toThrow(TypeError);
  });
  it('requires unique, ordered, consistently scoped full thread runs', () => {
    const second = { ...completed, id: id(3), createdAt: '2026-10-11T12:00:00.500Z' };
    const thread = {
      basis: 'prepared-ask-example',
      metadata,
      id: id(2),
      principalId: null,
      runs: [completed, second],
    };
    expect(parseAskThread(thread).runs).toHaveLength(2);
    for (const runs of [
      [],
      [completed, completed],
      [second, completed],
      [{ ...completed, threadId: id(99) }],
      [{ ...completed, principalId: id(99) }],
      [{ ...completed, metadata: { ...metadata, asOf: '2026-10-11T12:00:09.000Z' } }],
    ])
      expect(() => parseAskThread({ ...thread, runs })).toThrow(TypeError);
  });
  it('closes catalogue, synthetic grant and availability shapes with seven public states', () => {
    const base = { basis: 'prepared-ask-example', metadata };
    const availability = {
      ...base,
      mode: 'prepared-fixtures',
      commandHandlers: false,
      intents: [
        { intent: 'price_per_square_meter', available: true },
        { intent: 'unavailable', available: false },
      ],
    };
    expect(parseAskAvailability(availability)).toEqual(availability);
    expect(() => parseAskAvailability({ ...availability, intents: [] })).toThrow(TypeError);
    const grant = { scope: 'synthetic-fixture', capability: 'ask-fixture-v1-queued' };
    expect(parseAskFixtureGrant(grant)).toEqual(grant);
    expect(() => parseAskFixtureGrant({ ...grant, capability: 'short' })).toThrow(TypeError);
    expect(() => parseAskFixtureGrant({ ...grant, capability: `${grant.capability}\n` })).toThrow(
      TypeError,
    );
    const catalogue = {
      ...base,
      items: ASK_STATES.map((state, index) => ({
        state,
        runId: id(index + 1),
        threadId: id(index + 101),
        grant,
      })),
    };
    expect(parseAskFixtureCatalogue(catalogue)).toEqual(catalogue);
    expect(() =>
      parseAskFixtureCatalogue({ ...catalogue, items: catalogue.items.slice(1) }),
    ).toThrow(TypeError);
    expect(() =>
      parseAskFixtureCatalogue({ ...catalogue, items: [...catalogue.items].reverse() }),
    ).toThrow(TypeError);
    expect(() =>
      parseAskFixtureCatalogue({
        ...catalogue,
        items: catalogue.items.map((item) => ({ ...item, threadId: id(99) })),
      }),
    ).toThrow(TypeError);
  });
});
