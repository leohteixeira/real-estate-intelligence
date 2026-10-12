import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  AskLiveError,
  MODEL_EXPLANATION_REPOSITORY,
  type ModelExplanationRepository,
} from '@rei/application';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApi } from '../configure-api';
import { AskInternalController } from './ask-internal.controller';
const request = {
  version: 1,
  eventId: '0199bd4a-1111-7111-8111-111111111110',
  runId: '0199bd4a-1111-7111-8111-111111111111',
  threadId: '0199bd4a-1111-7111-8111-111111111112',
  executionId: '0199bd4a-1111-7111-8111-111111111113',
  operation: 'get',
};
describe('scoped internal model receipt HTTP', () => {
  let app: INestApplication, origin: string;
  const execute = vi.fn<ModelExplanationRepository['execute']>();
  beforeEach(async () => {
    execute.mockReset();
    execute.mockResolvedValue({ operation: 'get', explanation: null });
    const module = await Test.createTestingModule({
      controllers: [AskInternalController],
      providers: [{ provide: MODEL_EXPLANATION_REPOSITORY, useValue: { execute } }],
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
    authorization = `Bearer ${'g'.repeat(43)}`,
    suffix = '',
    id = request.runId,
    type = 'application/json',
  ) =>
    fetch(`${origin}/api/v1/internal/ask/runs/${id}/model-explanation${suffix}`, {
      method: 'POST',
      headers: { authorization, 'content-type': type },
      body: JSON.stringify(body),
    });
  it('passes only parsed identity, header grant and cancellation to the application port', async () => {
    const response = await send();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ operation: 'get', explanation: null });
    expect(execute).toHaveBeenCalledWith(request, 'g'.repeat(43), expect.any(AbortSignal));
  });
  it.each([
    [{ ...request, extra: true }, undefined, '', request.runId, 'application/json', 400],
    [request, 'Bearer short', '', request.runId, 'application/json', 401],
    [request, undefined, '?model=evil', request.runId, 'application/json', 400],
    [request, undefined, '', request.threadId, 'application/json', 400],
    [request, undefined, '', request.runId, 'text/plain', 415],
  ] as const)(
    'refuses malformed envelopes before work',
    async (body, authority, suffix, id, type, status) => {
      expect((await send(body, authority, suffix, id, type)).status).toBe(status);
      expect(execute).not.toHaveBeenCalled();
    },
  );
  it.each([
    ['forbidden', 403],
    ['conflict', 409],
    ['invalid', 400],
    ['unavailable', 503],
  ] as const)('sanitizes %s', async (kind, status) => {
    execute.mockRejectedValue(new AskLiveError(kind));
    const response = await send();
    expect(response.status).toBe(status);
    expect(JSON.stringify(await response.json())).not.toContain('g'.repeat(43));
  });
});
