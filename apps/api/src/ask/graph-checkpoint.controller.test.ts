import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AskLiveError, GRAPH_CHECKPOINT_PORT, type GraphCheckpointPort } from '@rei/application';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApi } from '../configure-api';
import { GraphCheckpointController } from './graph-checkpoint.controller';

const request = {
  version: 1,
  eventId: '0199bd4a-1111-7111-8111-111111111110',
  runId: '0199bd4a-1111-7111-8111-111111111111',
  threadId: '0199bd4a-1111-7111-8111-111111111112',
  executionId: '0199bd4a-1111-7111-8111-111111111113',
  graphVersion: 'price-v1',
  namespace: '',
  operation: 'get',
  checkpointId: null,
};
describe('GraphCheckpointController', () => {
  let app: INestApplication, origin: string;
  const execute = vi.fn<GraphCheckpointPort['execute']>();
  beforeEach(async () => {
    execute.mockReset();
    execute.mockResolvedValue({ operation: 'get', record: null });
    const module = await Test.createTestingModule({
      controllers: [GraphCheckpointController],
      providers: [{ provide: GRAPH_CHECKPOINT_PORT, useValue: { execute } }],
    }).compile();
    app = module.createNestApplication();
    configureApi(app);
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    if (!address || typeof address === 'string') throw new Error('TCP fixture required.');
    origin = `http://127.0.0.1:${address.port}`;
  });
  afterEach(async () => app.close());
  const send = (
    body: unknown = request,
    headers: Record<string, string> = {
      'content-type': 'application/json',
      authorization: `Bearer ${'g'.repeat(43)}`,
    },
    suffix = '',
    id = request.runId,
  ) =>
    fetch(`${origin}/api/v1/ask/runs/${id}/checkpoints${suffix}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  it('uses only the dedicated header grant and bounded request signal', async () => {
    const response = await send();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ operation: 'get', record: null });
    expect(execute).toHaveBeenCalledWith(request, 'g'.repeat(43), expect.any(AbortSignal));
  });
  it.each([
    [{ ...request, extra: true }, undefined, '', request.runId, 400],
    [request, undefined, '?limit=1', request.runId, 400],
    [request, undefined, '', request.threadId, 400],
    [request, { 'content-type': 'application/json' }, '', request.runId, 401],
    [
      request,
      { 'content-type': 'application/json', authorization: 'Bearer short' },
      '',
      request.runId,
      401,
    ],
    [
      request,
      { 'content-type': 'text/plain', authorization: `Bearer ${'g'.repeat(43)}` },
      '',
      request.runId,
      415,
    ],
  ] as const)(
    'refuses malformed envelopes before application work',
    async (body, headers, suffix, id, status) => {
      const response = await send(body, headers, suffix, id);
      expect(response.status).toBe(status);
      expect(execute).not.toHaveBeenCalled();
    },
  );
  it.each([
    ['forbidden', 403],
    ['conflict', 409],
    ['invalid', 400],
    ['unavailable', 503],
  ] as const)('maps %s to its safe HTTP category', async (kind, status) => {
    execute.mockRejectedValue(new AskLiveError(kind));
    const response = await send();
    expect(response.status).toBe(status);
    expect(JSON.stringify(await response.json()).includes('g'.repeat(43))).toBe(false);
  });
});
