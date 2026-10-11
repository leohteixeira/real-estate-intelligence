import { describe, expect, it, vi } from 'vitest';
import { AskLiveError, type AskRunRepository } from './ask-run.repository.js';
import { AskRunService } from './ask-run.service.js';
describe('Ask lifecycle facade', () => {
  it('forwards every operation, cancellation and authority without replacing repository failures', async () => {
    const failure = new AskLiveError('forbidden');
    const repository = {
      create: vi.fn<AskRunRepository['create']>().mockRejectedValue(failure),
      run: vi.fn<AskRunRepository['run']>().mockRejectedValue(failure),
      thread: vi.fn<AskRunRepository['thread']>().mockRejectedValue(failure),
      events: vi.fn<AskRunRepository['events']>().mockRejectedValue(failure),
      claim: vi.fn<AskRunRepository['claim']>().mockRejectedValue(failure),
      tool: vi.fn<AskRunRepository['tool']>().mockRejectedValue(failure),
      complete: vi.fn<AskRunRepository['complete']>().mockRejectedValue(failure),
    };
    const service = new AskRunService(repository),
      signal = new AbortController().signal;
    const identity = { version: 1 as const, eventId: 'event', runId: 'run', threadId: 'thread' };
    const inputs = { priceMinorUnits: 100, currency: 'BRL' as const, areaSquareMeters: 2 };
    const create = {
      mode: 'structured-price-v1' as const,
      threadId: null,
      query: 'Calculate.',
      locale: 'en' as const,
      placeId: null,
      inputs,
    };
    const tool = {
      ...identity,
      executionId: 'execution',
      operation: 'price-per-square-meter' as const,
      inputs,
    };
    const calculate = () => ({
      kind: 'price_per_square_meter' as const,
      minorUnits: 50,
      currency: 'BRL' as const,
      areaUnit: 'm2' as const,
      inputs,
      computedAt: '2026-10-11T00:00:00.000Z',
    });
    const complete = {
      ...identity,
      executionId: 'execution',
      evidence: null,
      failure: 'execution_unavailable' as const,
    };
    for (const work of [
      service.create(create, 'authority', 'key', signal),
      service.run('run', 'authority', signal),
      service.thread('thread', 'authority', signal),
      service.events('run', 'authority', 2, signal),
      service.claim(identity, signal),
      service.tool(tool, 'grant', calculate, signal),
      service.complete(complete, signal),
    ])
      await expect(work).rejects.toBe(failure);
    expect(repository.create).toHaveBeenCalledExactlyOnceWith(create, 'authority', 'key', signal);
    expect(repository.run).toHaveBeenCalledExactlyOnceWith('run', 'authority', signal);
    expect(repository.thread).toHaveBeenCalledExactlyOnceWith('thread', 'authority', signal);
    expect(repository.events).toHaveBeenCalledExactlyOnceWith('run', 'authority', 2, signal);
    expect(repository.claim).toHaveBeenCalledExactlyOnceWith(identity, signal);
    expect(repository.tool).toHaveBeenCalledExactlyOnceWith(tool, 'grant', calculate, signal);
    expect(repository.complete).toHaveBeenCalledExactlyOnceWith(complete, signal);
    expect(failure.message).toBe('Ask operation unavailable.');
  });
});
