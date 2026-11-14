import { Controller, Get, HttpException, Logger, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { AskQuotaError } from '@rei/application';
import { AskQuotaException } from './ask-quota.exception';
import { ApiExceptionFilter } from './api-exception.filter';
import { AskPendingLimitException } from './ask-pending-limit.exception';

@Controller()
class RefusalController {
  @Get('quota')
  public quota(): never {
    throw new AskQuotaException(new AskQuotaError('visitor', '2026-10-27T03:00:00.000Z'));
  }

  @Get('capacity')
  public capacity(): never {
    throw new AskPendingLimitException();
  }

  @Get('pool-timeout')
  public poolTimeout(): never {
    throw Object.assign(new Error('postgres://app:secret@db/app timed out'), {
      name: 'DatabasePoolTimeoutError',
    });
  }

  @Get('statement-timeout')
  public statementTimeout(): never {
    throw Object.assign(new Error('canceling statement for "private value"'), {
      code: '57014',
      detail: 'private detail',
    });
  }

  @Get('unsafe-identity')
  public unsafeIdentity(): never {
    throw Object.assign(new Error('failure'), {
      name: 'postgres://app:secret@db/app',
      code: 'private value with spaces',
    });
  }

  @Get('other')
  public other(): never {
    throw new HttpException({ code: 'thread_pending_limit', limit: 3, secret: 'unsafe' }, 429);
  }
}

let application: INestApplication;
let origin: string;
beforeAll(async () => {
  const module = await Test.createTestingModule({ controllers: [RefusalController] }).compile();
  application = module.createNestApplication();
  application.useGlobalFilters(new ApiExceptionFilter());
  await application.listen(0, '127.0.0.1');
  origin = await application.getUrl();
});
afterAll(async () => application.close());

it('preserves only the closed Ask capacity refusal through the production global sanitizer', async () => {
  const response = await fetch(`${origin}/capacity`);
  expect(response.status).toBe(429);
  expect(response.headers.get('x-request-id')).toBeTruthy();
  expect(await response.json()).toEqual({ code: 'thread_pending_limit', limit: 3 });
});

it('continues sanitizing arbitrary 429 exception payloads', async () => {
  const response = await fetch(`${origin}/other`);
  expect(response.status).toBe(429);
  expect(await response.json()).toEqual({
    error: {
      code: 'too_many_requests',
      message: 'Too many requests were made.',
      requestId: expect.any(String),
    },
  });
});

it('preserves the strict quota refusal and reopening through the global sanitizer', async () => {
  const response = await fetch(`${origin}/quota`);
  expect(response.status).toBe(429);
  expect(response.headers.get('x-request-id')).toBeTruthy();
  expect(await response.json()).toEqual({
    code: 'quota_exceeded',
    scope: 'visitor',
    reopensAt: '2026-10-27T03:00:00.000Z',
  });
});

it.each([
  ['pool-timeout', { errorName: 'DatabasePoolTimeoutError' }],
  ['statement-timeout', { errorName: 'Error', errorCode: '57014' }],
  ['unsafe-identity', { errorName: 'Error' }],
] as const)(
  'logs only the class and driver code that identify a %s failure',
  async (path, identity) => {
    const logError = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      const response = await fetch(`${origin}/${path}`);
      expect(response.status).toBe(500);
      const requestId = response.headers.get('x-request-id');
      expect(await response.json()).toEqual({
        error: { code: 'internal_error', message: 'An unexpected error occurred.', requestId },
      });
      expect(logError).toHaveBeenCalledWith({
        event: 'api.unexpected_failure',
        requestId,
        ...identity,
      });
      expect(JSON.stringify(logError.mock.calls)).not.toMatch(/secret|private/);
    } finally {
      logError.mockRestore();
    }
  },
);
