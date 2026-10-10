import type { INestApplication } from '@nestjs/common';
import { DATABASE_AVAILABILITY_PROBE, type DatabaseAvailabilityProbe } from '@rei/application';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { configureApi } from '../configure-api';
import { REQUEST_ID_HEADER } from '../http/request-id';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let app: INestApplication;
  let baseUrl: string;
  let available: boolean;
  let probe: DatabaseAvailabilityProbe;

  beforeEach(async () => {
    available = true;
    probe = { isAvailable: vi.fn(async () => available) };

    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: DATABASE_AVAILABILITY_PROBE, useValue: probe }],
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
  });

  it('serves liveness without consulting the database', async () => {
    const response = await fetch(`${baseUrl}/health`);

    expect(response.status).toBe(200);
    expect(response.headers.get(REQUEST_ID_HEADER)).toMatch(UUID_PATTERN);
    await expect(response.json()).resolves.toEqual({ status: 'healthy' });
    expect(probe.isAvailable).not.toHaveBeenCalled();
  });

  it('reports readiness when the database is available', async () => {
    const response = await fetch(`${baseUrl}/ready`);

    expect(response.status).toBe(200);
    expect(response.headers.get(REQUEST_ID_HEADER)).toMatch(UUID_PATTERN);
    await expect(response.json()).resolves.toEqual({ status: 'ready', database: 'available' });
  });

  it('returns 503 when the database is unavailable', async () => {
    available = false;

    const response = await fetch(`${baseUrl}/ready`);

    expect(response.status).toBe(503);
    expect(response.headers.get(REQUEST_ID_HEADER)).toMatch(UUID_PATTERN);
    await expect(response.json()).resolves.toEqual({
      status: 'not-ready',
      database: 'unavailable',
    });
  });
});

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
