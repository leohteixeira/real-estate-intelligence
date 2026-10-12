import { Controller, Get, HttpException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { ApiExceptionFilter } from './api-exception.filter';
import { AskPendingLimitException } from './ask-pending-limit.exception';

@Controller()
class RefusalController {
  @Get('capacity')
  public capacity(): never {
    throw new AskPendingLimitException();
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
