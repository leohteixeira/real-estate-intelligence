import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { LOCATIONS_FACADE, type LocationsFacade } from '@rei/application';
import { parsePlaceResponse, parsePlacesResponse, parseReductionsResponse } from '@rei/contracts';
import {
  PostgresLocationsFacade,
  SYNTHETIC_READ_METADATA,
  supplementaryPlaces,
  syntheticPlaces,
} from '@rei/infrastructure';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { configureApi } from '../configure-api';
import { DATABASE_CONNECTION } from '../persistence/persistence.module';
import { LocationsModule } from './locations.module';

describe('persisted Locations production module HTTP contract', () => {
  const places = [...syntheticPlaces(), ...supplementaryPlaces()];
  let unavailable = false;
  const query = vi.fn(async (sql: string, parameters: readonly unknown[] = []) => {
    if (unavailable) throw new Error('Owned fixture database unavailable');
    if (sql.includes('locations.reference_metadata')) return [SYNTHETIC_READ_METADATA];
    if (sql.includes('FROM properties.property')) return [];
    if (sql.includes('SELECT public_id AS id FROM scope'))
      return places
        .filter((place) => place.breadcrumbs.some((crumb) => crumb.id === parameters[0]))
        .map((place) => ({ id: place.id }));
    const selected = sql.includes('p.parent_id IS NULL')
      ? places.filter((place) => place.parentId === null)
      : sql.includes('p.parent_id = (SELECT')
        ? places.filter((place) => place.parentId === parameters[0])
        : places.filter((place) => place.id === parameters[0]);
    return selected.map((detail) => ({ detail: structuredClone(detail) }));
  });
  let app: INestApplication;
  let base: string;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [LocationsModule] })
      .overrideProvider(DATABASE_CONNECTION)
      .useValue({ query, close: async () => undefined })
      .compile();
    expect(module.get<LocationsFacade>(LOCATIONS_FACADE)).toBeInstanceOf(PostgresLocationsFacade);
    app = module.createNestApplication();
    configureApi(app);
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    if (!address || typeof address === 'string') throw new Error('Missing HTTP listener');
    base = `http://127.0.0.1:${address.port}/api/v1/places`;
  });
  afterAll(async () => {
    await app.close();
  });
  async function get(path = '') {
    const response = await fetch(`${base}${path}`);
    expect(response.status).toBe(200);
    return response.json();
  }
  it('uses the PostgreSQL provider for twenty-place traversal and detached response metadata', async () => {
    const root = parsePlacesResponse(await get());
    expect(root.metadata).toEqual(SYNTHETIC_READ_METADATA);
    expect(root.items).toEqual(places.filter((place) => place.parentId === null));
    for (const place of places) {
      expect(parsePlaceResponse(await get(`/${place.id}`)).place).toEqual(place);
      expect(parsePlacesResponse(await get(`/${place.id}/children`)).items).toEqual(
        places.filter((child) => child.parentId === place.id),
      );
    }
    expect(query.mock.calls.every(([sql]) => sql.includes('locations.'))).toBe(true);
  });
  it('recognizes registered supplementary scopes without adding prepared reductions', async () => {
    for (const block of supplementaryPlaces()) {
      expect(parseReductionsResponse(await get(`/${block.id}/largest-reductions`)).items).toEqual(
        [],
      );
      const malformed = await fetch(`${base}/${block.id}/largest-reductions?cursor=bad`);
      expect(malformed.status).toBe(400);
    }
    expect((await fetch(`${base}/unknown-place`)).status).toBe(404);
    expect((await fetch(`${base}/unknown-place/children`)).status).toBe(404);
    expect((await fetch(`${base}/BRAZIL`)).status).toBe(400);
    expect((await fetch(`${base}?private=ignored`)).status).toBe(400);
    expect((await fetch(base.replace('/api/v1', ''))).status).toBe(404);
  });
  it('fails closed with the standard sanitized HTTP error when persistence fails', async () => {
    unavailable = true;
    try {
      const response = await fetch(base);
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: {
          code: 'internal_error',
          message: 'An unexpected error occurred.',
          requestId: response.headers.get('x-request-id'),
        },
      });
    } finally {
      unavailable = false;
    }
  });
});
