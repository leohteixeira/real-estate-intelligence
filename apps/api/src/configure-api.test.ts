import { Controller, Get, Logger, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { ErrorResponse } from '@rei/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { configureApi } from './configure-api';
import { REQUEST_ID_HEADER } from './http/request-id';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

@Controller('fixture')
class FixtureController {
  @Get()
  public read(): { readonly status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('failure')
  public fail(): never {
    throw new Error('DATABASE_URL leaked from /workspace/internal.ts');
  }
}

describe('configureApi', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeEach(async () => {
    const module = await Test.createTestingModule({ controllers: [FixtureController] }).compile();
    app = module.createNestApplication();
    configureApi(app);
    await app.listen(0, '127.0.0.1');

    const address = app.getHttpServer().address();
    if (!address || typeof address === 'string') {
      throw new Error('the test server did not expose a TCP address');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await app.close();
    vi.restoreAllMocks();
  });

  it('serves business routes only under the versioned prefix', async () => {
    const response = await fetch(`${baseUrl}/api/v1/fixture`);

    expect(response.status).toBe(200);
    expect(response.headers.get(REQUEST_ID_HEADER)).toMatch(UUID_PATTERN);
    await expect(response.json()).resolves.toEqual({ status: 'ok' });
  });

  it('returns a stable not-found envelope with one request identifier', async () => {
    const response = await fetch(`${baseUrl}/api/v1/does-not-exist`);
    const body = (await response.json()) as ErrorResponse;
    const requestId = response.headers.get(REQUEST_ID_HEADER);

    expect(response.status).toBe(404);
    expect(requestId).toMatch(UUID_PATTERN);
    expect(body).toEqual({
      error: {
        code: 'not_found',
        message: 'The requested resource was not found.',
        requestId,
      },
    });
  });

  it('replaces a client-supplied request identifier', async () => {
    const spoofedRequestId = '00000000-0000-4000-8000-000000000000';
    const response = await fetch(`${baseUrl}/api/v1/does-not-exist`, {
      headers: { [REQUEST_ID_HEADER]: spoofedRequestId },
    });
    const body = (await response.json()) as ErrorResponse;
    const requestId = response.headers.get(REQUEST_ID_HEADER);

    expect(requestId).toMatch(UUID_PATTERN);
    expect(requestId).not.toBe(spoofedRequestId);
    expect(body.error.requestId).toBe(requestId);
    expect(JSON.stringify(body)).not.toContain(spoofedRequestId);
  });

  it('hides unexpected exception details behind the internal error envelope', async () => {
    const logError = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const response = await fetch(`${baseUrl}/api/v1/fixture/failure`);
    const body = (await response.json()) as ErrorResponse;
    const requestId = response.headers.get(REQUEST_ID_HEADER);

    expect(response.status).toBe(500);
    expect(requestId).toMatch(UUID_PATTERN);
    expect(body).toEqual({
      error: {
        code: 'internal_error',
        message: 'An unexpected error occurred.',
        requestId,
      },
    });
    expect(JSON.stringify(body)).not.toContain('DATABASE_URL');
    expect(JSON.stringify(body)).not.toContain('/workspace/internal.ts');
    expect(logError).toHaveBeenCalledWith({ event: 'api.unexpected_failure', requestId });
    expect(JSON.stringify(logError.mock.calls)).not.toContain('DATABASE_URL');
    expect(JSON.stringify(logError.mock.calls)).not.toContain('/workspace/internal.ts');
  });
});
