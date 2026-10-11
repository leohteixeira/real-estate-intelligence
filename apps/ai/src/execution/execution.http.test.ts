import { afterEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../app.module';
import { configureExecutionHttp } from './execution.http';

const token = 'a'.repeat(48);
const input = {
  version: 1,
  runId: '0197e4e0-0000-7000-8000-000000000001',
  threadId: '0197e4e0-0000-7000-8000-000000000002',
  step: 'foundation',
  query: 'private question',
  locale: 'en',
};
let app: NestExpressApplication | undefined;
async function server(authority: string | undefined = token, unexpectedFailure = false) {
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = module.createNestApplication<NestExpressApplication>({ bodyParser: false, logger: false });
  configureExecutionHttp(app, authority);
  if (unexpectedFailure)
    app.use(() => {
      throw new Error(`${input.query}:${token}`);
    });
  await app.init();
  return request(app.getHttpServer());
}
afterEach(async () => {
  await app?.close();
});
describe('AI scoped HTTP boundary', () => {
  it('checks authority before parsing, preserves health, and admits actual evidence', async () => {
    const client = await server();
    expect((await client.get('/health')).status).toBe(200);
    const refused = await client
      .post('/internal/v1/runs/execute')
      .type('json')
      .send('{malformed private');
    expect(refused.status).toBe(401);
    expect(refused.body).toEqual({ code: 'unauthorized' });
    const valid = await client
      .post('/internal/v1/runs/execute')
      .auth(token, { type: 'bearer' })
      .send(input);
    expect(valid.status).toBe(200);
    expect(valid.body).toEqual({
      version: 1,
      runId: input.runId,
      threadId: input.threadId,
      step: 'foundation',
      outcome: 'foundation-executed',
      visitedNodes: ['noOp'],
    });
  });
  it('sanitizes invalid JSON, oversized body, wrong media type and invalid contracts', async () => {
    const client = await server();
    const malformed = await client
      .post('/internal/v1/runs/execute')
      .auth(token, { type: 'bearer' })
      .type('json')
      .send('{private-malformed');
    expect(malformed.status).toBe(400);
    expect(malformed.body).toEqual({ code: 'bad_request' });
    const oversized = await client
      .post('/internal/v1/runs/execute')
      .auth(token, { type: 'bearer' })
      .send({ ...input, query: 'x'.repeat(100001) });
    expect(oversized.status).toBe(413);
    expect(oversized.body).toEqual({ code: 'bad_request' });
    const wrong = await client
      .post('/internal/v1/runs/execute')
      .auth(token, { type: 'bearer' })
      .type('text')
      .send(input.query);
    expect(wrong.status).toBe(415);
    expect(wrong.body).toEqual({ code: 'unsupported_media_type' });
    const invalid = await client
      .post('/internal/v1/runs/execute')
      .auth(token, { type: 'bearer' })
      .send({ ...input, token });
    expect(invalid.status).toBe(400);
    expect(invalid.body).toEqual({ code: 'bad_request' });
  });
  it('keeps health available when execution is disabled', async () => {
    const client = await server('');
    expect((await client.get('/health')).status).toBe(200);
    const disabled = await client.post('/internal/v1/runs/execute').type('json').send('{malformed');
    expect(disabled.status).toBe(503);
    expect(disabled.body).toEqual({ code: 'unavailable' });
  });
  it('sanitizes unsupported JSON charset only after checking authority', async () => {
    const client = await server();
    const refused = await client
      .post('/internal/v1/runs/execute')
      .set('Content-Type', 'application/json; charset=iso-8859-1')
      .send(JSON.stringify(input));
    expect(refused.status).toBe(401);
    expect(refused.body).toEqual({ code: 'unauthorized' });
    const unsupported = await client
      .post('/internal/v1/runs/execute')
      .auth(token, { type: 'bearer' })
      .set('Content-Type', 'application/json; charset=iso-8859-1')
      .send(JSON.stringify(input));
    expect(unsupported.status).toBe(415);
    expect(unsupported.body).toEqual({ code: 'unsupported_media_type' });
  });
  it('sanitizes unsupported content encoding only after checking authority', async () => {
    const client = await server();
    const refused = await client
      .post('/internal/v1/runs/execute')
      .set('Content-Encoding', 'unsupported')
      .send(input);
    expect(refused.status).toBe(401);
    expect(refused.body).toEqual({ code: 'unauthorized' });
    const unsupported = await client
      .post('/internal/v1/runs/execute')
      .auth(token, { type: 'bearer' })
      .set('Content-Encoding', 'unsupported')
      .send(input);
    expect(unsupported.status).toBe(415);
    expect(unsupported.body).toEqual({ code: 'unsupported_media_type' });
  });
  it('keeps unexpected parser or middleware errors sanitized as unavailable', async () => {
    const client = await server(token, true);
    const failure = await client
      .post('/internal/v1/runs/execute')
      .auth(token, { type: 'bearer' })
      .send(input);
    expect(failure.status).toBe(503);
    expect(failure.body).toEqual({ code: 'unavailable' });
  });
});
