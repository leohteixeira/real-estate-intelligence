import { describe, expect, it, vi } from 'vitest';
import type { CheckpointRequest } from '@rei/domain';
import { GraphCheckpointService } from './graph-checkpoint.service.js';
const id = '0199bd4a-1111-7111-8111-111111111111';
const request: CheckpointRequest = {
  version: 1,
  eventId: id,
  runId: id,
  threadId: id,
  executionId: id,
  graphVersion: 'price-v1',
  namespace: '',
  operation: 'get',
  checkpointId: null,
};
describe('checkpoint application facade', () => {
  it('delegates isolated authority, cancellation and bounded retention to persistence', async () => {
    const execute = vi.fn().mockResolvedValue({ operation: 'get', record: null }),
      prune = vi.fn().mockResolvedValue(1);
    const service = new GraphCheckpointService({ execute, prune });
    const signal = new AbortController().signal;
    expect(await service.execute(request, 'g'.repeat(43), signal)).toEqual({
      operation: 'get',
      record: null,
    });
    expect(execute).toHaveBeenCalledWith(request, 'g'.repeat(43), signal);
    expect(await service.prune(50, signal)).toBe(1);
    expect(prune).toHaveBeenCalledWith(50, signal);
  });
  it('rejects malformed grants, limits and cancelled work before persistence', async () => {
    const execute = vi.fn(),
      prune = vi.fn();
    const service = new GraphCheckpointService({ execute, prune });
    const signal = new AbortController().signal;
    await expect(service.execute(request, 'weak', signal)).rejects.toMatchObject({
      kind: 'forbidden',
    });
    for (const limit of [0, 51, NaN, 1.5])
      await expect(service.prune(limit, signal)).rejects.toMatchObject({ kind: 'invalid' });
    await expect(service.execute(request, 'g'.repeat(43), AbortSignal.abort())).rejects.toThrow();
    await expect(service.prune(1, AbortSignal.abort())).rejects.toThrow();
    expect(execute).not.toHaveBeenCalled();
    expect(prune).not.toHaveBeenCalled();
  });
});
