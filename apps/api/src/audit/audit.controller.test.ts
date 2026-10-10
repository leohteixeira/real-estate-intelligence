import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RequestAuditTrace } from '@rei/application';
import { API_PREFIX } from '@rei/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuditController } from './audit.controller';

describe('AuditController', () => {
  let app: INestApplication;
  let baseUrl: string;
  const execute = vi.fn<RequestAuditTrace['execute']>();

  beforeEach(async () => {
    execute.mockResolvedValue('0199c8f2-2394-7ba0-8f9e-286378779219' as never);
    const module = await Test.createTestingModule({
      controllers: [AuditController],
      providers: [{ provide: RequestAuditTrace, useValue: { execute } }],
    }).compile();

    app = module.createNestApplication();
    app.setGlobalPrefix(API_PREFIX);
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    if (!address || typeof address === 'string') {
      throw new Error('the test server did not expose a TCP address');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    execute.mockReset();
    await app.close();
  });

  it('accepts a body-free tracer request and returns the exact event id', async () => {
    const response = await fetch(`${baseUrl}/api/v1/audit/traces`, { method: 'POST' });

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      eventId: '0199c8f2-2394-7ba0-8f9e-286378779219',
    });
    expect(execute).toHaveBeenCalledOnce();
  });
});
