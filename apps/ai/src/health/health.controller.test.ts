import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { HealthController } from './health.controller';

describe('HealthController', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeEach(async () => {
    const module = await Test.createTestingModule({ controllers: [HealthController] }).compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');

    const address = app.getHttpServer().address();
    if (!address || typeof address === 'string') {
      throw new Error('the test server did not expose a TCP address');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns dependency-free liveness over HTTP', async () => {
    const response = await fetch(`${baseUrl}/health`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'healthy' });
  });
});
