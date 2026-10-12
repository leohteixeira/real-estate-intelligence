import {
  Controller,
  Get,
  InternalServerErrorException,
  Logger,
  Post,
  Req,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { ErrorResponse } from '@rei/contracts';
import type { Request } from 'express';
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

  @Get('request-id')
  public readRequestId(@Req() request: Request): { readonly requestId: string | null } {
    return { requestId: request.get(REQUEST_ID_HEADER) ?? null };
  }

  @Post('payload')
  public acceptPayload(): { readonly status: 'accepted' } {
    return { status: 'accepted' };
  }

  @Get('failure')
  public fail(): never {
    throw new Error('DATABASE_URL leaked from /workspace/internal.ts');
  }

  @Get('nest-failure')
  public failWithNestException(): never {
    throw new InternalServerErrorException('secret provider payload');
  }
}

@Controller('ask/runs/:id/checkpoints')
class CheckpointParserFixtureController {
  @Post()
  public accept(): { readonly status: 'accepted' } {
    return { status: 'accepted' };
  }
}

describe('configureApi', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [FixtureController, CheckpointParserFixtureController],
    }).compile();
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
    const response = await fetch(`${baseUrl}/api/v1/fixture/request-id`, {
      headers: { [REQUEST_ID_HEADER]: spoofedRequestId },
    });
    const body = (await response.json()) as { readonly requestId: string };
    const requestId = response.headers.get(REQUEST_ID_HEADER);

    expect(requestId).toMatch(UUID_PATTERN);
    expect(requestId).not.toBe(spoofedRequestId);
    expect(body.requestId).toBe(requestId);
    expect(JSON.stringify(body)).not.toContain(spoofedRequestId);
  });

  it('preserves body-parser HTTP status for an oversized JSON request', async () => {
    const response = await fetch(`${baseUrl}/api/v1/fixture/payload`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 'x'.repeat(101 * 1_024) }),
    });
    const body = (await response.json()) as ErrorResponse;
    const requestId = response.headers.get(REQUEST_ID_HEADER);

    expect(response.status).toBe(413);
    expect(body).toEqual({
      error: {
        code: 'payload_too_large',
        message: 'The request payload is too large.',
        requestId,
      },
    });
  });

  it('raises only the fixed checkpoint route parser to 768 KiB', async () => {
    const route = `${baseUrl}/api/v1/ask/runs/0199bd4a-1111-7111-8111-111111111111/checkpoints`;
    for (const [length, status] of [
      [786420, 201],
      [786432, 413],
    ] as const) {
      const response = await fetch(route, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ value: 'x'.repeat(length) }),
      });
      expect(response.status).toBe(status);
    }
  });

  it('rejects chunked checkpoint JSON above the same HTTP bound', async () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ value: 'x'.repeat(786432) }));
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let at = 0; at < bytes.length; at += 16384)
          controller.enqueue(bytes.slice(at, at + 16384));
        controller.close();
      },
    });
    const options = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      duplex: 'half' as const,
    };
    const response = await fetch(
      `${baseUrl}/api/v1/ask/runs/0199bd4a-1111-7111-8111-111111111111/checkpoints`,
      options,
    );
    expect(response.status).toBe(413);
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

  it('records a sanitized event for a Nest 500 exception', async () => {
    const logError = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const response = await fetch(`${baseUrl}/api/v1/fixture/nest-failure`);
    const body = (await response.json()) as ErrorResponse;
    const requestId = response.headers.get(REQUEST_ID_HEADER);

    expect(response.status).toBe(500);
    expect(body.error).toEqual({
      code: 'internal_error',
      message: 'An unexpected error occurred.',
      requestId,
    });
    expect(logError).toHaveBeenCalledWith({ event: 'api.unexpected_failure', requestId });
    expect(JSON.stringify(logError.mock.calls)).not.toContain('secret provider payload');
  });
});
