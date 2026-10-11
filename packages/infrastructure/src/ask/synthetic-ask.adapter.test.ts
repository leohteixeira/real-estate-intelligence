import { AskQueryService } from '@rei/application';
import { ASK_STATES, assertAskPreview } from '@rei/domain';
import { describe, expect, it } from 'vitest';
import { SyntheticAskAdapter } from './synthetic-ask.adapter.js';

describe('SyntheticAskAdapter static examples', () => {
  const adapter = new SyntheticAskAdapter(),
    service = new AskQueryService(adapter);
  it('publishes seven canonical UUIDv7 fixtures, synthetic grants and non-live availability', async () => {
    expect(await service.availability()).toMatchObject({
      mode: 'prepared-fixtures',
      commandHandlers: false,
      metadata: { synthetic: true, liveExecution: false, durableReplay: false },
    });
    const catalogue = await service.catalogue();
    expect(catalogue.items.map((item) => item.state)).toEqual(ASK_STATES);
    for (const fixture of catalogue.items) {
      expect(fixture.runId).toMatch(/^[0-9a-f-]+$/);
      const run = await service.run(fixture.runId, fixture.grant.capability);
      expect(run?.state).toBe(fixture.state);
      const frames = (await service.preview(fixture.runId, fixture.grant.capability))!;
      expect(() => assertAskPreview(frames)).not.toThrow();
      expect(frames.filter((frame) => frame.terminal)).toHaveLength(1);
      expect(frames.at(-1)?.event).toBe(
        `ask.${fixture.state === 'queued' || fixture.state === 'running' || fixture.state === 'awaiting_confirmation' ? 'completed' : fixture.state}`,
      );
      expect(
        await service.preview(fixture.runId, fixture.grant.capability, frames.at(-1)!.id),
      ).toEqual([]);
      const thread = (await service.thread(fixture.threadId, fixture.grant.capability))!;
      expect(thread.runs).toHaveLength(2);
      expect(thread.runs[0]?.result).toEqual({
        kind: 'unavailable_intent',
        reason: 'not_available',
      });
      expect(await service.run(thread.runs[0]!.id, fixture.grant.capability)).toEqual(
        thread.runs[0],
      );
      expect(
        (await service.preview(thread.runs[0]!.id, fixture.grant.capability))?.[0]?.event,
      ).toBe('ask.completed');
    }
  });
  it('pauses without computing and records edited confirmation only in the finite preview', async () => {
    const fixture = (await service.catalogue()).items.find(
      (item) => item.state === 'awaiting_confirmation',
    )!;
    const run = (await service.run(fixture.runId, fixture.grant.capability))!;
    expect(run.decision).toMatchObject({
      confidence: 0.64,
      degraded: true,
      requiresConfirmation: true,
    });
    expect(run.result).toBeNull();
    expect(run.confirmation).toBeNull();
    const frames = (await service.preview(fixture.runId, fixture.grant.capability))!;
    expect(frames.map((frame) => frame.run.state)).toEqual([
      'awaiting_confirmation',
      'running',
      'completed',
    ]);
    expect(frames[1]?.run.confirmation?.inputs).toEqual({
      priceMinorUnits: 81000000,
      currency: 'BRL',
      areaSquareMeters: 90,
    });
    expect(frames[2]?.run.result).toMatchObject({
      kind: 'price_per_square_meter',
      minorUnits: 900000,
    });
    expect(frames[2]?.run.originalInputs).toEqual(run.originalInputs);
    expect(await service.run(fixture.runId, fixture.grant.capability)).toEqual(run);
  });
  it('detaches nested adapter values and resolves only its own IDs', async () => {
    const catalogue = await adapter.catalogue(),
      fixture = catalogue.items[0]!;
    Reflect.set(catalogue.items[0]!.grant, 'capability', 'caller mutation');
    expect((await adapter.catalogue()).items[0]?.grant.capability).not.toBe('caller mutation');
    const thread = (await adapter.thread(fixture.threadId))!;
    Reflect.set(thread.runs[1]!.originalInputs!, 'priceMinorUnits', 1);
    expect((await adapter.run(fixture.runId))?.originalInputs?.priceMinorUnits).toBe(80000000);
    const frames = (await adapter.preview(fixture.runId))!;
    Reflect.set(frames[0]!.run.metadata, 'asOf', 'caller mutation');
    expect((await adapter.preview(fixture.runId))?.[0]?.run.metadata.asOf).not.toBe(
      'caller mutation',
    );
    expect(await adapter.capabilityFor('run', 'unknown')).toBeNull();
    expect(await adapter.capabilityFor('thread', 'unknown')).toBeNull();
    expect(await adapter.run('unknown')).toBeNull();
    expect(await adapter.thread('unknown')).toBeNull();
    expect(await adapter.preview('unknown')).toBeNull();
  });
});
