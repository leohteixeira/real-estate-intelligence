import { describe, expect, it, vi } from 'vitest';
import type { AskFixtureReadPort } from './ask-fixture-read.port.js';
import { AskQueryService } from './ask-query.service.js';
import { AskAccessDeniedError } from './ask.facade.js';
import type { AskRun } from '@rei/domain';

const identifier = '0199c8f2-2394-7000-8000-000000000001';
const metadata = {
  fixtureVersion: 'ask-v1',
  asOf: '2026-10-11T12:00:00.000Z',
  synthetic: true,
  liveExecution: false,
  durableReplay: false,
} as const;
const run: AskRun = {
  basis: 'prepared-ask-example',
  metadata,
  id: identifier,
  threadId: identifier,
  principalId: null,
  question: 'Synthetic question',
  locale: 'en',
  placeId: null,
  createdAt: metadata.asOf,
  updatedAt: metadata.asOf,
  state: 'completed',
  originalInputs: null,
  decision: {
    intent: 'unavailable',
    confidence: 0.99,
    degraded: false,
    requiresConfirmation: false,
    source: 'synthetic-fixture',
    decidedAt: metadata.asOf,
  },
  confirmation: null,
  result: { kind: 'unavailable_intent', reason: 'not_available' },
  terminal: { state: 'completed', reason: null, at: metadata.asOf },
  steps: [{ sequence: 1, phase: 'completed', at: metadata.asOf }],
};
function fake() {
  return {
    availability: vi.fn(async () => ({
      basis: 'prepared-ask-example' as const,
      metadata,
      mode: 'prepared-fixtures' as const,
      commandHandlers: false as const,
      intents: [],
    })),
    catalogue: vi.fn(async () => ({ basis: 'prepared-ask-example' as const, metadata, items: [] })),
    capabilityFor: vi.fn(async () => 'synthetic-capability'),
    run: vi.fn(async () => run),
    thread: vi.fn(async () => ({
      basis: 'prepared-ask-example' as const,
      metadata,
      id: identifier,
      principalId: null,
      runs: [run],
    })),
    preview: vi.fn(async () => [
      {
        basis: 'prepared-ask-example' as const,
        metadata,
        run,
        runId: identifier,
        id: `${identifier}:v1:1`,
        sequence: 1,
        version: 1 as const,
        event: 'ask.completed' as const,
        terminal: true,
      },
    ]),
  } satisfies AskFixtureReadPort;
}
describe('AskQueryService with a fake fixture port only', () => {
  it('refuses malformed and wrong authority before any history or preview read', async () => {
    const port = fake(),
      service = new AskQueryService(port);
    for (const method of ['run', 'thread', 'preview'] as const) {
      await expect(service[method](identifier, 'short')).rejects.toBeInstanceOf(
        AskAccessDeniedError,
      );
      await expect(service[method](identifier, 'wrong-fixture-capability')).rejects.toBeInstanceOf(
        AskAccessDeniedError,
      );
    }
    expect(port.capabilityFor).toHaveBeenCalledTimes(3);
    expect(port.run).not.toHaveBeenCalled();
    expect(port.thread).not.toHaveBeenCalled();
    expect(port.preview).not.toHaveBeenCalled();
  });
  it('refuses unknown resources without probing their contents and validates canonical IDs', async () => {
    const port = fake(),
      service = new AskQueryService(port);
    port.capabilityFor.mockResolvedValueOnce(null as never);
    await expect(service.run(identifier, 'synthetic-capability')).rejects.toBeInstanceOf(
      AskAccessDeniedError,
    );
    expect(port.run).not.toHaveBeenCalled();
    for (const id of ['BAD', identifier.toUpperCase(), identifier.replace('7000', '4000')])
      await expect(service.run(id, 'synthetic-capability')).rejects.toThrow(
        'Invalid Ask identifier.',
      );
  });
  it('returns deep clones on every public surface and handles authorized missing fixtures', async () => {
    const port = fake(),
      service = new AskQueryService(port);
    const read = (await service.run(identifier, 'synthetic-capability'))!;
    Reflect.set(read, 'question', 'caller mutation');
    Reflect.set(read.metadata, 'asOf', 'caller mutation');
    expect((await service.run(identifier, 'synthetic-capability'))?.question).toBe(
      'Synthetic question',
    );
    const thread = (await service.thread(identifier, 'synthetic-capability'))!;
    Reflect.set(thread.runs[0]!, 'question', 'caller mutation');
    expect((await service.thread(identifier, 'synthetic-capability'))?.runs[0]?.question).toBe(
      'Synthetic question',
    );
    expect(await service.availability()).toEqual(await port.availability());
    expect(await service.catalogue()).toEqual(await port.catalogue());
    port.run.mockResolvedValueOnce(null as never);
    port.thread.mockResolvedValueOnce(null as never);
    port.preview.mockResolvedValueOnce(null as never);
    expect(await service.run(identifier, 'synthetic-capability')).toBeNull();
    expect(await service.thread(identifier, 'synthetic-capability')).toBeNull();
    expect(await service.preview(identifier, 'synthetic-capability')).toBeNull();
  });
  it('rejects foreign, malformed, zero, future and wrong-version cursors while replaying only later frames', async () => {
    const service = new AskQueryService(fake());
    expect(await service.preview(identifier, 'synthetic-capability')).toHaveLength(1);
    expect(await service.preview(identifier, 'synthetic-capability', `${identifier}:v1:1`)).toEqual(
      [],
    );
    for (const cursor of [
      '',
      `${identifier}:v1:0`,
      `${identifier}:v1:01`,
      `${identifier}:v1:2`,
      `${identifier}:v2:1`,
      'foreign:v1:1',
      `${identifier}:v1:1\n`,
    ])
      await expect(service.preview(identifier, 'synthetic-capability', cursor)).rejects.toThrow(
        'Invalid Ask replay cursor.',
      );
  });
  it('rejects a broken prepared preview and preserves unexpected port failures for HTTP sanitization', async () => {
    const port = fake(),
      service = new AskQueryService(port);
    port.preview.mockResolvedValueOnce([]);
    await expect(service.preview(identifier, 'synthetic-capability')).rejects.toThrow(
      'Invalid Ask preview.',
    );
    port.run.mockRejectedValueOnce(new Error('private adapter fault'));
    await expect(service.run(identifier, 'synthetic-capability')).rejects.toThrow(
      'private adapter fault',
    );
  });
});
