import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { COLLECTION_FACADE, type CollectionFacade } from '@rei/application';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { configureApi } from '../configure-api';
import { CollectionController } from './collection.controller';

describe('CollectionController', () => {
  let app: INestApplication;
  let baseUrl: string;
  const listEnabledSources = vi.fn<CollectionFacade['listEnabledSources']>();

  beforeEach(async () => {
    listEnabledSources.mockResolvedValue([]);
    const module = await Test.createTestingModule({
      controllers: [CollectionController],
      providers: [{ provide: COLLECTION_FACADE, useValue: { listEnabledSources } }],
    }).compile();
    app = module.createNestApplication();
    configureApi(app);
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    if (!address || typeof address === 'string') throw new Error('test server has no TCP address');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    listEnabledSources.mockReset();
    await app.close();
  });

  it('returns the exact empty envelope', async () => {
    const response = await fetch(`${baseUrl}/api/v1/collection/sources`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ sources: [] });
  });

  it('maps enabled sources in source-ID order without internal metadata', async () => {
    listEnabledSources.mockResolvedValue([
      {
        sourceId: 'alpha-source',
        displayLabel: 'Alpha',
        enabled: true,
        permissions: {
          collectionAllowed: true,
          imageFetchingAllowed: false,
          listingTextDisplayAllowed: true,
        },
        licence: { status: 'licensed', label: 'Open licence', url: 'https://example.invalid' },
      },
      {
        sourceId: 'beta-unverified-licence-source',
        displayLabel: 'Unverified licence',
        enabled: true,
        permissions: {
          collectionAllowed: true,
          imageFetchingAllowed: false,
          listingTextDisplayAllowed: false,
        },
        licence: { status: 'not-verified', label: null, url: null },
      },
      {
        sourceId: 'synthetic-data',
        displayLabel: 'Labelled synthetic fixture',
        enabled: true,
        permissions: {
          collectionAllowed: true,
          imageFetchingAllowed: true,
          listingTextDisplayAllowed: true,
        },
        licence: { status: 'not-applicable', label: 'Synthetic data', url: null },
      },
    ]);

    const response = await fetch(`${baseUrl}/api/v1/collection/sources`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      sources: [
        {
          sourceId: 'alpha-source',
          displayLabel: 'Alpha',
          enabled: true,
          permissions: {
            collectionAllowed: true,
            imageFetchingAllowed: false,
            listingTextDisplayAllowed: true,
          },
          licence: {
            status: 'licensed',
            label: 'Open licence',
            url: 'https://example.invalid',
          },
        },
        {
          sourceId: 'beta-unverified-licence-source',
          displayLabel: 'Unverified licence',
          enabled: true,
          permissions: {
            collectionAllowed: true,
            imageFetchingAllowed: false,
            listingTextDisplayAllowed: false,
          },
          licence: { status: 'not-verified', label: null, url: null },
        },
        {
          sourceId: 'synthetic-data',
          displayLabel: 'Labelled synthetic fixture',
          enabled: true,
          permissions: {
            collectionAllowed: true,
            imageFetchingAllowed: true,
            listingTextDisplayAllowed: true,
          },
          licence: { status: 'not-applicable', label: 'Synthetic data', url: null },
        },
      ],
    });
    expect(JSON.stringify(body)).not.toMatch(/review|rate|access|evidence|enabledAt/i);
  });

  it('returns a sanitized error envelope when persistence fails', async () => {
    listEnabledSources.mockRejectedValue(
      new Error(['postgres://operator', ':secret@database:5432/internal failed'].join('')),
    );
    const response = await fetch(`${baseUrl}/api/v1/collection/sources`);
    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).toContain('internal_error');
    expect(body).not.toMatch(/operator|secret|database:5432/);
  });
});
